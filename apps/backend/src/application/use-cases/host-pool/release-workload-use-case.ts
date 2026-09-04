import { Injectable } from "@nestjs/common";

import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { PoolHostId } from "../../../domain/entities/host-pool/pool-host-id";
import { PoolHostRepository } from "../../interfaces/repositories/pool-host-repository";

export type ReleaseWorkloadParams = {
    readonly environmentId: EnvironmentId;
};

// Free the environment's seat; the host agent stops the slot on its next poll. The machine itself is
// NOT returned here — an emptied host lingers for the pool's idle TTL so the next environment starts
// in seconds instead of waiting for a new machine (the reconcile sweep does the returning).
@Injectable()
export class ReleaseWorkloadUseCase {
    constructor(private readonly poolHostRepository: PoolHostRepository) {}

    async execute(params: ReleaseWorkloadParams): Promise<void> {
        const host = await this.poolHostRepository.findByEnvironment(params.environmentId);

        if (!host) {
            return;
        }

        await this.poolHostRepository.with(PoolHostId.fromString(host.id), (locked) => {
            locked.release(params.environmentId.getValue());
        });
    }
}
