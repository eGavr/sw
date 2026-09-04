import { Injectable } from "@nestjs/common";

import { IdleHostCriteria } from "../../../domain/entities/host-pool/idle-host-criteria";
import { PoolHost, PoolHostProviderContext } from "../../../domain/entities/host-pool/pool-host";
import { PoolHostId } from "../../../domain/entities/host-pool/pool-host-id";
import { ReturnableHostCriteria } from "../../../domain/entities/host-pool/returnable-host-criteria";
import { SilentHostCriteria } from "../../../domain/entities/host-pool/silent-host-criteria";
import { StuckOrderingCriteria } from "../../../domain/entities/host-pool/stuck-ordering-criteria";
import { HostProviderGateway } from "../../interfaces/gateways/host-provider-gateway";
import { Logger } from "../../interfaces/logger";
import { PoolHostRepository } from "../../interfaces/repositories/pool-host-repository";

export type ReconcileHostPoolParams = {
    readonly idleTtlMs: number;
    readonly silenceAllowanceMs: number;
    readonly orderingTimeoutMs: number;
};

// The pool's periodic self-audit — machines cost real money, so every tick answers one question: is
// every leased machine still earning its keep? Silent and never-arrived machines are written off,
// empty ones past the idle TTL are chosen for return, and everything returnable is handed back to the
// cloud and forgotten. Finally the orphan sweep returns machines the cloud still bills that NO pool
// row knows (a lost row must never mean a leaked lease). Each sweep command re-checks its criterion
// under the row lock, so a seat landing mid-sweep wins over the sweep.
@Injectable()
export class ReconcileHostPoolUseCase {
    constructor(
        private readonly poolHostRepository: PoolHostRepository,
        private readonly hostProviderGateway: HostProviderGateway,
        private readonly logger: Logger,
    ) {}

    async execute(params: ReconcileHostPoolParams): Promise<void> {
        const now = new Date();
        const idle = IdleHostCriteria.from(now, params.idleTtlMs);
        const silent = SilentHostCriteria.from(now, params.silenceAllowanceMs);
        const stuckOrdering = StuckOrderingCriteria.from(now, params.orderingTimeoutMs);
        const returnable = ReturnableHostCriteria.create();

        const hosts = await this.poolHostRepository.listAll();

        for (const host of hosts) {
            const updated = await this.poolHostRepository.with(PoolHostId.fromString(host.id), (locked) => {
                locked.writeOffIfSilent(silent);
                locked.writeOffIfStuckOrdering(stuckOrdering);
                locked.retireIfIdle(idle);
            });

            if (updated && updated.state !== host.state) {
                this.logger.log(`host pool: host ${host.id}: ${host.state} -> ${updated.state}`);
            }

            if (updated?.isReturnable(returnable)) {
                await this.returnToCloud(updated);
            }
        }

        await this.sweepOrphans(hosts);
    }

    // Best-effort per machine: a failed return leaves the row, so the next tick retries; the row is
    // forgotten only after the cloud accepted the return.
    private async returnToCloud(host: PoolHost): Promise<void> {
        try {
            await this.hostProviderGateway.deprovision(host.id, host.providerContext);
            await this.poolHostRepository.delete(PoolHostId.fromString(host.id));
            this.logger.log(`host pool: host ${host.id} returned to the cloud`);
        } catch (error) {
            this.logger.warn(
                `host pool: host ${host.id}: return failed, will retry: `
                + (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    // Machines leased under our label that no pool row knows are leaks — return them. The locations
    // swept are those of the CURRENT rows; a location whose every row is already gone falls off this
    // radar (full coverage needs enumerating bindings — a follow-up for the live phase).
    private async sweepOrphans(hosts: ReadonlyArray<PoolHost>): Promise<void> {
        const knownIds = new Set(hosts.map((host) => host.id));

        for (const context of distinctContexts(hosts)) {
            const leasedIds = await this.hostProviderGateway.listLeasedHostIds(context).catch(() => []);

            for (const leasedId of leasedIds) {
                if (!knownIds.has(leasedId)) {
                    await this.hostProviderGateway.deprovision(leasedId, context).catch(() => undefined);
                }
            }
        }
    }
}

function distinctContexts(hosts: ReadonlyArray<PoolHost>): Array<PoolHostProviderContext> {
    const byFingerprint = new Map<string, PoolHostProviderContext>();

    for (const host of hosts) {
        const context = host.providerContext;

        byFingerprint.set(JSON.stringify(context), context);
    }

    return [...byFingerprint.values()];
}
