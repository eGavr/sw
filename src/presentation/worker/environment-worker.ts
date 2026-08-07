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
    ReclaimStuckEnvironmentsUseCase,
} from "../../application/use-cases/environments/reclaim-stuck-environments-use-case";
import { defaultHeartbeatFreshnessMs } from "../../domain/entities/environment/heartbeat-freshness";

const channel = "environment_work";

// Session-scoped advisory-lock keys so that, with N workers, only one runs each time-based sweep
// (reaper / GC) at a time (the others skip it); they never block the LISTEN/pump path.
const reaperLockKey = 0x53574b52;
const gcLockKey = 0x53574743;

const defaultReaperIntervalMs = 10_000;
const defaultStartingTimeoutMs = 15_000;
const defaultPreparingTimeoutMs = 120_000;
const defaultMaxAttempts = 3;
const defaultGcIntervalMs = 30_000;
const defaultFailedTtlMs = 3_600_000;

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

    private readonly reaperIntervalMs: number;
    private readonly startingTimeoutMs: number;
    private readonly preparingTimeoutMs: number;
    private readonly maxAttempts: number;
    private readonly gcIntervalMs: number;
    private readonly freshnessMs: number;
    private readonly failedTtlMs: number;

    constructor(
        private readonly configService: ConfigService,
        private readonly prepareNextEnvironment: PrepareNextEnvironmentUseCase,
        private readonly deprovisionDeletingEnvironments: DeprovisionDeletingEnvironmentsUseCase,
        private readonly reclaimStuckEnvironments: ReclaimStuckEnvironmentsUseCase,
        private readonly collectGarbageEnvironments: CollectGarbageEnvironmentsUseCase,
    ) {
        this.reaperIntervalMs = this.number("WORKER_REAPER_INTERVAL_MS", defaultReaperIntervalMs);
        this.startingTimeoutMs = this.number("WORKER_STARTING_TIMEOUT_MS", defaultStartingTimeoutMs);
        this.preparingTimeoutMs = this.number("WORKER_PREPARING_TIMEOUT_MS", defaultPreparingTimeoutMs);
        this.maxAttempts = this.number("WORKER_PROVISION_MAX_ATTEMPTS", defaultMaxAttempts);
        this.gcIntervalMs = this.number("WORKER_GC_INTERVAL_MS", defaultGcIntervalMs);
        this.freshnessMs = this.number("HEARTBEAT_FRESHNESS_MS", defaultHeartbeatFreshnessMs);
        this.failedTtlMs = this.number("WORKER_FAILED_TTL_MS", defaultFailedTtlMs);
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

        // A timeout has no event, and an in-memory timer dies with the worker, so the reaper is a
        // periodic tick: it reclaims stuck rows back to `enqueued`, which re-fires the work NOTIFY,
        // keeping the pump event-driven. unref so it never keeps the process alive on its own.
        this.reaperTimer = setInterval(() => void this.reap(), this.reaperIntervalMs);
        this.reaperTimer.unref();

        // GC is another time-based sweep (no event marks a row as collectable): hard-delete finished
        // rows so the table does not grow.
        this.gcTimer = setInterval(() => void this.collect(), this.gcIntervalMs);
        this.gcTimer.unref();

        // NOTIFY is not durable: catch up on whatever is already waiting.
        await this.pump();
    }

    async onApplicationShutdown(): Promise<void> {
        if (this.reaperTimer) {
            clearInterval(this.reaperTimer);
            this.reaperTimer = null;
        }

        if (this.gcTimer) {
            clearInterval(this.gcTimer);
            this.gcTimer = null;
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

    private async reap(): Promise<void> {
        await this.underLock(reaperLockKey, () => this.reclaimStuckEnvironments.execute({
            startingTimeoutMs: this.startingTimeoutMs,
            preparingTimeoutMs: this.preparingTimeoutMs,
            maxAttempts: this.maxAttempts,
        }));
    }

    private async collect(): Promise<void> {
        await this.underLock(gcLockKey, () => this.collectGarbageEnvironments.execute({
            freshnessMs: this.freshnessMs,
            failedTtlMs: this.failedTtlMs,
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
