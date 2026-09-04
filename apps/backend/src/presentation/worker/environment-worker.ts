import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "pg";

import {
    CollectGarbageEnvironmentsUseCase,
} from "../../application/use-cases/environments/collect-garbage-environments-use-case";
import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../application/use-cases/environments/prepare-next-environment-use-case";
import {
    ReclaimCrashedEnvironmentsUseCase,
} from "../../application/use-cases/environments/reclaim-crashed-environments-use-case";
import {
    ReclaimStuckEnvironmentsUseCase,
} from "../../application/use-cases/environments/reclaim-stuck-environments-use-case";
import {
    ReleaseStaleReservationsUseCase,
} from "../../application/use-cases/environments/release-stale-reservations-use-case";
import {
    ReconcileHostPoolUseCase,
} from "../../application/use-cases/host-pool/reconcile-host-pool-use-case";
import { defaultHeartbeatFreshnessMs } from "../../domain/entities/environment/heartbeat-freshness";
import {
    PreparingTimeoutOverride,
} from "../../domain/entities/environment/stuck-provisioning-criteria";
import { Logger } from "../../infrastructure/logging/logger";

const channel = "environment_work";

// Session-scoped advisory-lock keys so that, with N workers, only one runs each time-based sweep
// (reaper / GC / reservation / host pool) at a time (the others skip it); they never block the
// LISTEN/pump path.
const reaperLockKey = 0x53574b52;
const gcLockKey = 0x53574743;
const reservationLockKey = 0x53575253;
const hostPoolLockKey = 0x53574850;

const defaultReaperIntervalMs = 10_000;
const defaultStartingTimeoutMs = 15_000;
const defaultPreparingTimeoutMs = 120_000;
const defaultMaxAttempts = 3;
const defaultGcIntervalMs = 30_000;
const defaultFailedTtlMs = 3_600_000;

// The reservation sweep ticks faster than the reaper: a dead reserver should return its environment
// to the pool in seconds (staleness ~3 missed reservation heartbeats + at most one tick).
const defaultReservationSweepIntervalMs = 3_000;
const defaultReservationStalenessMs = 10_000;

// The host pool's own clocks: an emptied machine lingers for the idle TTL (the next environment
// starts in seconds instead of waiting for a lease), a minute of agent silence writes a machine off,
// and a physical machine's hand-over gets the same generous allowance as its environments' preparing.
const defaultHostPoolReconcileIntervalMs = 30_000;
const defaultHostPoolIdleTtlMs = 15 * 60_000;
const defaultHostPoolSilenceAllowanceMs = 60_000;
const defaultHostPoolOrderingTimeoutMs = 45 * 60_000;

// Per-kind preparing leases, e.g. WORKER_PREPARING_TIMEOUTS="baremetal=2700000": a physical machine is
// handed over in minutes, not the seconds the default lease assumes. Malformed entries fail fast.
function parsePreparingTimeouts(configured: string | undefined): ReadonlyArray<PreparingTimeoutOverride> {
    if (!configured) {
        return [];
    }

    return configured.split(",").map((entry) => {
        const [kind, timeout] = entry.split("=").map((part) => part.trim());
        const preparingMs = Number(timeout);

        if (!kind || !Number.isFinite(preparingMs) || preparingMs <= 0) {
            throw new Error(`WORKER_PREPARING_TIMEOUTS: malformed entry "${entry}" (want kind=milliseconds)`);
        }

        return { kind, preparingMs };
    });
}

// Presentation runtime of the worker: holds a raw pg LISTEN connection (the doorbell) and, on each
// wakeup, drives the use cases. It does no SQL/locks itself — that lives in the data source; the
// notification is just a dumb broadcast, so N workers can all wake and the atomic claim de-dupes them.
@Injectable()
export class EnvironmentWorker implements OnApplicationBootstrap, OnApplicationShutdown {
    private client: Client | null = null;
    private pumping = false;
    private pending = false;
    private reaperTimer: NodeJS.Timeout | null = null;
    private gcTimer: NodeJS.Timeout | null = null;
    private reservationTimer: NodeJS.Timeout | null = null;
    private hostPoolTimer: NodeJS.Timeout | null = null;

    private readonly reaperIntervalMs: number;
    private readonly startingTimeoutMs: number;
    private readonly preparingTimeoutMs: number;
    private readonly preparingTimeoutOverrides: ReadonlyArray<PreparingTimeoutOverride>;
    private readonly maxAttempts: number;
    private readonly gcIntervalMs: number;
    private readonly freshnessMs: number;
    private readonly failedTtlMs: number;
    private readonly reservationSweepIntervalMs: number;
    private readonly reservationStalenessMs: number;
    private readonly hostPoolReconcileIntervalMs: number;
    private readonly hostPoolIdleTtlMs: number;
    private readonly hostPoolSilenceAllowanceMs: number;
    private readonly hostPoolOrderingTimeoutMs: number;

    constructor(
        private readonly configService: ConfigService,
        private readonly logger: Logger,
        private readonly prepareNextEnvironment: PrepareNextEnvironmentUseCase,
        private readonly deprovisionDeletingEnvironments: DeprovisionDeletingEnvironmentsUseCase,
        private readonly reclaimStuckEnvironments: ReclaimStuckEnvironmentsUseCase,
        private readonly reclaimCrashedEnvironments: ReclaimCrashedEnvironmentsUseCase,
        private readonly collectGarbageEnvironments: CollectGarbageEnvironmentsUseCase,
        private readonly releaseStaleReservations: ReleaseStaleReservationsUseCase,
        private readonly reconcileHostPool: ReconcileHostPoolUseCase,
    ) {
        this.reaperIntervalMs = this.number("WORKER_REAPER_INTERVAL_MS", defaultReaperIntervalMs);
        this.startingTimeoutMs = this.number("WORKER_STARTING_TIMEOUT_MS", defaultStartingTimeoutMs);
        this.preparingTimeoutMs = this.number("WORKER_PREPARING_TIMEOUT_MS", defaultPreparingTimeoutMs);
        this.preparingTimeoutOverrides = parsePreparingTimeouts(
            this.configService.get<string>("WORKER_PREPARING_TIMEOUTS"),
        );
        this.maxAttempts = this.number("WORKER_PROVISION_MAX_ATTEMPTS", defaultMaxAttempts);
        this.gcIntervalMs = this.number("WORKER_GC_INTERVAL_MS", defaultGcIntervalMs);
        this.freshnessMs = this.number("HEARTBEAT_FRESHNESS_MS", defaultHeartbeatFreshnessMs);
        this.failedTtlMs = this.number("WORKER_FAILED_TTL_MS", defaultFailedTtlMs);
        this.reservationSweepIntervalMs = this.number(
            "WORKER_RESERVATION_SWEEP_INTERVAL_MS",
            defaultReservationSweepIntervalMs,
        );
        this.reservationStalenessMs = this.number("RESERVATION_STALENESS_MS", defaultReservationStalenessMs);
        this.hostPoolReconcileIntervalMs = this.number(
            "HOST_POOL_RECONCILE_INTERVAL_MS",
            defaultHostPoolReconcileIntervalMs,
        );
        this.hostPoolIdleTtlMs = this.number("HOST_POOL_IDLE_TTL_MS", defaultHostPoolIdleTtlMs);
        this.hostPoolSilenceAllowanceMs = this.number(
            "HOST_POOL_SILENCE_ALLOWANCE_MS",
            defaultHostPoolSilenceAllowanceMs,
        );
        this.hostPoolOrderingTimeoutMs = this.number(
            "HOST_POOL_ORDERING_TIMEOUT_MS",
            defaultHostPoolOrderingTimeoutMs,
        );
    }

    private number(key: string, fallback: number): number {
        return Number(this.configService.get<string>(key) ?? String(fallback));
    }

    async onApplicationBootstrap(): Promise<void> {
        this.client = new Client({
            host: this.configService.getOrThrow("POSTGRES_HOST"),
            port: Number(this.configService.getOrThrow("POSTGRES_PORT")),
            user: this.configService.getOrThrow("POSTGRES_USER"),
            password: this.configService.getOrThrow("POSTGRES_PASSWORD"),
            database: this.configService.getOrThrow("POSTGRES_DATABASE"),
        });

        await this.client.connect();
        this.client.on("notification", () => void this.pump());
        await this.client.query(`LISTEN ${channel}`);
        this.logger.log(`worker: listening on "${channel}"`);

        // A timeout has no event, and an in-memory timer dies with the worker, so the reaper is a
        // periodic tick: it reclaims stuck rows back to `enqueued`, which re-fires the work NOTIFY,
        // keeping the pump event-driven. unref so it never keeps the process alive on its own.
        this.reaperTimer = setInterval(() => void this.reap(), this.reaperIntervalMs);
        this.reaperTimer.unref();

        // GC is another time-based sweep (no event marks a row as collectable): hard-delete finished
        // rows so the table does not grow.
        this.gcTimer = setInterval(() => void this.collect(), this.gcIntervalMs);
        this.gcTimer.unref();

        // A reservation going stale is silence, not an event (the reserving wd just stops heartbeating),
        // so it too is a periodic sweep — on its own faster tick, to return the environment to the pool
        // within seconds of its reserver dying.
        this.reservationTimer = setInterval(() => void this.sweepReservations(), this.reservationSweepIntervalMs);
        this.reservationTimer.unref();

        // The host pool's self-audit: write off silent/never-arrived machines, return idle and
        // written-off empty ones, sweep leaked leases — machines cost money by the hour.
        this.hostPoolTimer = setInterval(() => void this.reconcilePool(), this.hostPoolReconcileIntervalMs);
        this.hostPoolTimer.unref();

        // NOTIFY is not durable: catch up on whatever is already waiting.
        await this.pump();
    }

    async onApplicationShutdown(): Promise<void> {
        this.logger.log("worker: shutting down");

        if (this.reaperTimer) {
            clearInterval(this.reaperTimer);
            this.reaperTimer = null;
        }

        if (this.gcTimer) {
            clearInterval(this.gcTimer);
            this.gcTimer = null;
        }

        if (this.reservationTimer) {
            clearInterval(this.reservationTimer);
            this.reservationTimer = null;
        }

        if (this.hostPoolTimer) {
            clearInterval(this.hostPoolTimer);
            this.hostPoolTimer = null;
        }

        await this.client?.end();
        this.client = null;
    }

    // Coalesced drain: overlapping wakeups fold into a single re-run so two pumps never run at once.
    private async pump(): Promise<void> {
        if (this.pumping) {
            this.pending = true;

            return;
        }

        this.pumping = true;

        try {
            do {
                this.pending = false;
                await this.drainEnqueued();
                await this.deprovisionDeletingEnvironments.execute();
            } while (this.pending);
        } finally {
            this.pumping = false;
        }
    }

    private async drainEnqueued(): Promise<void> {
        let prepared = await this.prepareNextEnvironment.execute();

        while (prepared !== null) {
            prepared = await this.prepareNextEnvironment.execute();
        }
    }

    // One reaper tick reclaims both classes of environments the system can no longer trust: those stuck
    // in provisioning (back to the queue or failed) and those that reached `executing` and then died
    // (heartbeat lapsed → torn down). Both run under the one reaper lock so N workers don't double-sweep.
    private async reap(): Promise<void> {
        await this.underLock(reaperLockKey, async () => {
            await this.reclaimStuckEnvironments.execute({
                startingTimeoutMs: this.startingTimeoutMs,
                preparingTimeoutMs: this.preparingTimeoutMs,
                preparingTimeoutOverrides: this.preparingTimeoutOverrides,
                maxAttempts: this.maxAttempts,
            });
            await this.reclaimCrashedEnvironments.execute({ freshnessMs: this.freshnessMs });
        });
    }

    private async collect(): Promise<void> {
        await this.underLock(gcLockKey, () => this.collectGarbageEnvironments.execute({
            freshnessMs: this.freshnessMs,
            failedTtlMs: this.failedTtlMs,
        }));
    }

    private async sweepReservations(): Promise<void> {
        await this.underLock(reservationLockKey, () => this.releaseStaleReservations.execute({
            stalenessMs: this.reservationStalenessMs,
        }));
    }

    private async reconcilePool(): Promise<void> {
        await this.underLock(hostPoolLockKey, () => this.reconcileHostPool.execute({
            idleTtlMs: this.hostPoolIdleTtlMs,
            silenceAllowanceMs: this.hostPoolSilenceAllowanceMs,
            orderingTimeoutMs: this.hostPoolOrderingTimeoutMs,
        }));
    }

    // Run a sweep only if this worker wins the advisory lock (so N workers don't all sweep). Advisory
    // locks are per-connection, so lock and unlock run on the same captured client — a concurrent
    // shutdown swapping `this.client` cannot split the pair.
    private async underLock(key: number, sweep: () => Promise<void>): Promise<void> {
        const client = this.client;

        if (!client) {
            return;
        }

        const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [key]);

        if (!result.rows[0]?.locked) {
            return;
        }

        try {
            await sweep();
        } finally {
            await client.query("SELECT pg_advisory_unlock($1)", [key]);
        }
    }
}
