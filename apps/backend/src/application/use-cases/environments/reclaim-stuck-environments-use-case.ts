import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import {
    PreparingTimeoutOverride,
    StuckProvisioningCriteria,
} from "../../../domain/entities/environment/stuck-provisioning-criteria";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

export type ReclaimStuckEnvironmentsParams = {
    readonly startingTimeoutMs: number;
    readonly preparingTimeoutMs: number;
    readonly preparingTimeoutOverrides?: ReadonlyArray<PreparingTimeoutOverride>;
    readonly maxAttempts: number;
};

// Reaper scenario: a provisioning environment (starting/preparing) whose worker committed the state
// and then died leaves a stuck row (the DB only rolls back the uncommitted). Reclaim it — back to the
// queue within the retry budget, or terminally failed once it is spent. Reclaimed rows re-enter
// `enqueued`, which re-fires the work NOTIFY, so the workers pick them up again on their own.
@Injectable()
export class ReclaimStuckEnvironmentsUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute(params: ReclaimStuckEnvironmentsParams): Promise<void> {
        const criteria = StuckProvisioningCriteria.from(
            new Date(),
            {
                startingMs: params.startingTimeoutMs,
                preparingMs: params.preparingTimeoutMs,
            },
            params.preparingTimeoutOverrides ?? [],
        );

        const stuck = await this.environmentRepository.listStuckProvisioning(criteria);

        await Promise.all(stuck.map((environment) => this.reclaim(environment, params.maxAttempts)));
    }

    private async reclaim(environment: Environment, maxAttempts: number): Promise<void> {
        environment.reclaimStuck(maxAttempts);
        await this.environmentRepository.save(environment);

        // A retry goes back to `enqueued`; the next provision removes any stale container by env id
        // (idempotent), so nothing to clean up here. A terminal failure is never re-provisioned, so
        // tear its container down now (best-effort; a leak is caught later by env-id / GC).
        // TODO(byoc): pass the cloud account so a delegated VM is torn down in the user's folder, not ours.
        if (environment.state === EnvironmentState.Failed) {
            await this.environmentProviderGateway.deprovision(environment, null).catch(() => undefined);
        }
    }
}
