import { Injectable } from "@nestjs/common";

import { IdleLeaseCriteria } from "../../../domain/entities/machine-pool/idle-lease-criteria";
import { MachineLease, MachineLeaseProviderContext } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import { ReturnableLeaseCriteria } from "../../../domain/entities/machine-pool/returnable-lease-criteria";
import { SilentLeaseCriteria } from "../../../domain/entities/machine-pool/silent-lease-criteria";
import { StuckOrderingCriteria } from "../../../domain/entities/machine-pool/stuck-ordering-criteria";
import { MachineProviderGateway } from "../../interfaces/gateways/machine-provider-gateway";
import { Logger } from "../../interfaces/logger";
import { MachineLeaseRepository } from "../../interfaces/repositories/machine-lease-repository";

export type ReconcileMachinePoolParams = {
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
export class ReconcileMachinePoolUseCase {
    constructor(
        private readonly machineLeaseRepository: MachineLeaseRepository,
        private readonly machineProviderGateway: MachineProviderGateway,
        private readonly logger: Logger,
    ) {}

    async execute(params: ReconcileMachinePoolParams): Promise<void> {
        const now = new Date();
        const idle = IdleLeaseCriteria.from(now, params.idleTtlMs);
        const silent = SilentLeaseCriteria.from(now, params.silenceAllowanceMs);
        const stuckOrdering = StuckOrderingCriteria.from(now, params.orderingTimeoutMs);
        const returnable = ReturnableLeaseCriteria.create();

        const leases = await this.machineLeaseRepository.listAll();

        for (const lease of leases) {
            const updated = await this.machineLeaseRepository.with(MachineLeaseId.fromString(lease.id), (locked) => {
                locked.writeOffIfSilent(silent);
                locked.writeOffIfStuckOrdering(stuckOrdering);
                locked.retireIfIdle(idle);
            });

            if (updated && updated.state !== lease.state) {
                this.logger.log(`machine pool: lease ${lease.id}: ${lease.state} -> ${updated.state}`);
            }

            if (updated?.isReturnable(returnable)) {
                await this.returnToCloud(updated);
            }
        }

        await this.sweepOrphans(leases);
    }

    // Best-effort per machine: a failed return leaves the row, so the next tick retries; the row is
    // forgotten only after the cloud accepted the return.
    private async returnToCloud(lease: MachineLease): Promise<void> {
        try {
            await this.machineProviderGateway.deprovision(lease.id, lease.providerContext);
            await this.machineLeaseRepository.delete(MachineLeaseId.fromString(lease.id));
            this.logger.log(`machine pool: lease ${lease.id} returned to the cloud`);
        } catch (error) {
            this.logger.warn(
                `machine pool: lease ${lease.id}: return failed, will retry: `
                + (error instanceof Error ? error.message : String(error)),
            );
        }
    }

    // Machines leased under our label that no pool row knows are leaks — return them. The locations
    // swept are those of the CURRENT rows; a location whose every row is already gone falls off this
    // radar (full coverage needs enumerating bindings — a follow-up for the live phase).
    private async sweepOrphans(leases: ReadonlyArray<MachineLease>): Promise<void> {
        const knownIds = new Set(leases.map((lease) => lease.id));

        for (const context of distinctContexts(leases)) {
            const leasedIds = await this.machineProviderGateway.listLeaseIds(context).catch(() => []);

            for (const leasedId of leasedIds) {
                if (!knownIds.has(leasedId)) {
                    await this.machineProviderGateway.deprovision(leasedId, context).catch(() => undefined);
                }
            }
        }
    }
}

function distinctContexts(leases: ReadonlyArray<MachineLease>): Array<MachineLeaseProviderContext> {
    const byFingerprint = new Map<string, MachineLeaseProviderContext>();

    for (const lease of leases) {
        const context = lease.providerContext;

        byFingerprint.set(JSON.stringify(context), context);
    }

    return [...byFingerprint.values()];
}
