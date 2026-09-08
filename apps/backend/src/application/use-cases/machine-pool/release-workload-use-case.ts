import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { MachineLeaseId } from "../../../domain/entities/machine-pool/machine-lease-id";
import { MachineLeaseRepository } from "../../interfaces/repositories/machine-lease-repository";

export type ReleaseWorkloadParams = {
    readonly environmentId: EnvironmentId;
};

// Free the environment's seat; the host agent stops the slot on its next poll. The machine itself is
// NOT returned here — an emptied host lingers for the pool's idle TTL so the next environment starts
// in seconds instead of waiting for a new machine (the reconcile sweep does the returning).
@Injectable()
export class ReleaseWorkloadUseCase {
    constructor(private readonly machineLeaseRepository: MachineLeaseRepository) {}

    async execute(params: ReleaseWorkloadParams): Promise<void> {
        const lease = await this.machineLeaseRepository.findByEnvironment(params.environmentId);

        if (!lease) {
            return;
        }

        await this.machineLeaseRepository.with(MachineLeaseId.fromString(lease.id), (locked) => {
            locked.release(params.environmentId.getValue());
        });
    }
}
