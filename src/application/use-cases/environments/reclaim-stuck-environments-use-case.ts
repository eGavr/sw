import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { StuckProvisioningCriteria } from "../../../domain/entities/environment/stuck-provisioning-criteria";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { EnvironmentProviderGatewayResolver } from "../../interfaces/gateways/environment-provider-gateway-resolver";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";

export type ReclaimStuckEnvironmentsParams = {
    readonly startingTimeoutMs: number;
    readonly preparingTimeoutMs: number;
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
        private readonly providerAccountRepository: ProviderAccountRepository,
        private readonly environmentProviderGatewayResolver: EnvironmentProviderGatewayResolver,
    ) {}

    async execute(params: ReclaimStuckEnvironmentsParams): Promise<void> {
        const criteria = StuckProvisioningCriteria.from(new Date(), {
            startingMs: params.startingTimeoutMs,
            preparingMs: params.preparingTimeoutMs,
        });

        const stuck = await this.environmentRepository.listStuckProvisioning(criteria);

        await Promise.all(stuck.map((environment) => this.reclaim(environment, params.maxAttempts)));
    }

    private async reclaim(environment: Environment, maxAttempts: number): Promise<void> {
        environment.reclaimStuck(maxAttempts);
        await this.environmentRepository.save(environment);

        // A retry goes back to `enqueued`; the next provision removes any stale container by env id
        // (idempotent), so nothing to clean up here. A terminal failure is never re-provisioned, so
        // tear its container down now.
        if (environment.state === EnvironmentState.Failed) {
            await this.deprovisionQuietly(environment);
        }
    }

    private async gatewayFor(environment: Environment): Promise<EnvironmentProviderGateway> {
        if (!environment.providerAccountId) {
            throw new InternalError(`environment ${environment.id}: no provider account to route to`);
        }

        const providerAccount = await this.providerAccountRepository.get(
            ProviderAccountId.fromString(environment.providerAccountId),
        );

        return this.environmentProviderGatewayResolver.resolve(providerAccount.providerType);
    }

    private async deprovisionQuietly(environment: Environment): Promise<void> {
        try {
            const gateway = await this.gatewayFor(environment);
            await gateway.deprovision(environment);
        } catch {
            // Best-effort; a leaked container is caught later by env-id on the next provision/GC.
        }
    }
}

