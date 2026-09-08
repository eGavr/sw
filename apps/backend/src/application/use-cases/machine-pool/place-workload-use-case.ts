import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { MachinePoolExhaustedError } from "../../../domain/entities/machine-pool/error/machine-pool-exhausted-error";
import { MachineLease, MachineLeaseProviderContext } from "../../../domain/entities/machine-pool/machine-lease";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import {
    MachineLeaseState,
    placeableMachineLeaseStates,
} from "../../../domain/entities/machine-pool/machine-lease-state";
import { MachinePoolKey } from "../../../domain/entities/machine-pool/machine-pool-key";
import { WorkloadLaunch } from "../../../domain/entities/machine-pool/slot-assignment";
import { MachineProviderGateway } from "../../interfaces/gateways/machine-provider-gateway";
import { MachineLeaseRepository } from "../../interfaces/repositories/machine-lease-repository";

export type PlaceWorkloadParams = {
    readonly environmentId: EnvironmentId;
    readonly poolKey: MachinePoolKey;
    // The pool's estimate of a machine's slots — what a new lease seats until its machine arrives.
    readonly slotCapacity: number;
    readonly maxLeases: number;
    readonly providerContext: MachineLeaseProviderContext;
    readonly launch: WorkloadLaunch;
};

// Seat an environment somewhere in its binding's pool, in two steps that may run apart:
//   seat     — synchronously, at create-environment time: on the machine already holding its seat (a
//              retry), else on the fullest lease with a free slot, else on a new `enqueued` lease if
//              the pool's cap and the cloud's headroom allow — atomically, serialised per pool, so
//              concurrent placers (N workers, N API calls) can never over-seat. No room anywhere is
//              RESOURCE_EXHAUSTED, right there in the caller's face;
//   provision — later, by the worker: an enqueued lease gets its machine from the cloud (a leased
//              server, or one of the user's attached machines) and moves to `ordering`, waiting for the
//              machine's agent. The environment then waits in `preparing` until its slot's agent
//              registers it, exactly like every other compute path.
@Injectable()
export class PlaceWorkloadUseCase {
    constructor(
        private readonly machineLeaseRepository: MachineLeaseRepository,
        private readonly machineProviderGateway: MachineProviderGateway,
    ) {}

    async execute(params: PlaceWorkloadParams): Promise<void> {
        const lease = await this.seat(params);

        await this.provisionIfEnqueued(lease);
    }

    async seat(params: PlaceWorkloadParams): Promise<MachineLease> {
        const environmentId = params.environmentId.getValue();
        const existing = await this.machineLeaseRepository.findByEnvironment(params.environmentId);

        if (existing) {
            if (placeableMachineLeaseStates.includes(existing.state)) {
                return existing;
            }

            // The seat is on a written-off machine (silent / never arrived): leave the sinking ship —
            // free the seat there and get seated afresh below.
            await this.machineLeaseRepository.with(MachineLeaseId.fromString(existing.id), (lease) => {
                lease.release(environmentId);
            });
        }

        const headroom = await this.machineProviderGateway.headroom(params.providerContext);
        const limits = headroom.limitsFor(params.maxLeases);
        const seated = await this.machineLeaseRepository.placeOrCreate(
            params.poolKey,
            params.environmentId,
            (lease) => {
                lease.place(environmentId, params.launch);
            },
            () => {
                const lease = MachineLease.create({
                    poolKey: params.poolKey,
                    slotCapacity: headroom.slotCapacityOr(params.slotCapacity),
                    providerContext: params.providerContext,
                });

                lease.place(environmentId, params.launch);

                return lease;
            },
            limits,
        );

        if (!seated) {
            throw new MachinePoolExhaustedError(headroom.capAt(params.maxLeases));
        }

        return seated.lease;
    }

    // Exactly one worker asks the cloud for a lease's machine: the enqueued → ordering transition runs
    // under the row lock, so a rival that seated onto the same lease finds it already taken and leaves
    // the order to whoever made it. A cloud that refuses drops the row so the pool does not count a
    // phantom lease; its environments re-enter the queue via the preparing reclaim and are seated afresh.
    private async provisionIfEnqueued(lease: MachineLease): Promise<void> {
        if (lease.state !== MachineLeaseState.Enqueued) {
            return;
        }

        const leaseId = MachineLeaseId.fromString(lease.id);
        let ordering = false;
        const taken = await this.machineLeaseRepository.with(leaseId, (locked) => {
            if (locked.state === MachineLeaseState.Enqueued) {
                locked.markOrdering();
                ordering = true;
            }
        });

        if (!taken || !ordering) {
            return;
        }

        let machine;

        try {
            machine = await this.machineProviderGateway.provision(taken);
        } catch (error) {
            await this.machineLeaseRepository.delete(leaseId).catch(() => undefined);
            throw error;
        }

        await this.machineLeaseRepository.with(leaseId, (locked) => {
            locked.adoptMachine(machine);
        });
    }
}
