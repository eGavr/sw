import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { MachinePoolExhaustedError } from "../../../domain/entities/machine-pool/error/machine-pool-exhausted-error";
import { MachineLease, MachineLeaseProviderContext } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import { placeableMachineLeaseStates } from "../../../domain/entities/machine-pool/machine-lease-state";
import { MachinePoolKey } from "../../../domain/entities/machine-pool/machine-pool-key";
import { WorkloadLaunch } from "../../../domain/entities/machine-pool/slot-assignment";
import { MachineProviderGateway } from "../../interfaces/gateways/machine-provider-gateway";
import { MachineLeaseRepository } from "../../interfaces/repositories/machine-lease-repository";

export type PlaceWorkloadParams = {
    readonly environmentId: EnvironmentId;
    readonly poolKey: MachinePoolKey;
    readonly slotCapacity: number;
    readonly maxHosts: number;
    readonly providerContext: MachineLeaseProviderContext;
    readonly launch: WorkloadLaunch;
};

// Seat an environment somewhere in its binding's pool: on the machine already holding its seat (a
// provisioning retry), else on the fullest machine with a free slot, else on a newly built one —
// atomically, serialised per pool, so concurrent placers (N workers) can never order surplus
// machines or breach the spend cap. Only a freshly built machine is actually ordered from the cloud;
// the environment then waits in `preparing` until its slot's agent registers it, exactly like every
// other compute path.
@Injectable()
export class PlaceWorkloadUseCase {
    constructor(
        private readonly machineLeaseRepository: MachineLeaseRepository,
        private readonly machineProviderGateway: MachineProviderGateway,
    ) {}

    async execute(params: PlaceWorkloadParams): Promise<void> {
        const environmentId = params.environmentId.getValue();
        const existing = await this.machineLeaseRepository.findByEnvironment(params.environmentId);

        if (existing) {
            if (placeableMachineLeaseStates.includes(existing.state)) {
                return;
            }

            // The seat is on a written-off machine (silent / never arrived): leave the sinking ship —
            // free the seat there and get seated afresh below.
            await this.machineLeaseRepository.with(MachineLeaseId.fromString(existing.id), (lease) => {
                lease.release(environmentId);
            });
        }

        const seated = await this.machineLeaseRepository.placeOrCreate(
            params.poolKey,
            (lease) => {
                lease.place(environmentId, params.launch);
            },
            () => {
                const lease = MachineLease.create({
                    poolKey: params.poolKey,
                    slotCapacity: params.slotCapacity,
                    providerContext: params.providerContext,
                });

                lease.place(environmentId, params.launch);

                return lease;
            },
            params.maxHosts,
        );

        if (!seated) {
            throw new MachinePoolExhaustedError(params.maxHosts);
        }

        if (!seated.created) {
            return;
        }

        try {
            await this.machineProviderGateway.provision(seated.lease);
        } catch (error) {
            // The order never went out — drop the row so the pool does not count a phantom machine.
            // A rival seated here between our commit and this delete loses its assignment with the row;
            // its environment re-enters the queue via the preparing reclaim and is seated afresh.
            await this.machineLeaseRepository.delete(MachineLeaseId.fromString(seated.lease.id)).catch(() => undefined);
            throw error;
        }
    }
}
