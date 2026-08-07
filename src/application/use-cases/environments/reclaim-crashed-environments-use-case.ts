import { Injectable } from "@nestjs/common";

import { CrashedExecutionCriteria } from "../../../domain/entities/environment/crashed-execution-criteria";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

export type ReclaimCrashedEnvironmentsParams = {
    readonly freshnessMs: number;
};

// Reaper scenario: an environment that reached `executing` and then died — its heartbeat lapsed, so the
// container/agent is gone. Move it to `deleting` and tear the container down now (inline, like the
// stuck-provisioning fail path): the row already has a stale heartbeat, so GC could otherwise collect it
// before the deprovision sweep runs and leak the dead container. GC then removes the `deleting` row.
@Injectable()
export class ReclaimCrashedEnvironmentsUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute(params: ReclaimCrashedEnvironmentsParams): Promise<void> {
        const criteria = CrashedExecutionCriteria.from(new Date(), params.freshnessMs);

        const crashed = await this.environmentRepository.listCrashed(criteria);

        await Promise.all(crashed.map((environment) => this.reclaim(environment)));
    }

    private async reclaim(environment: Environment): Promise<void> {
        environment.reclaimCrashed();
        await this.environmentRepository.save(environment);

        await this.environmentProviderGateway.deprovision(environment).catch(() => undefined);
    }
}
