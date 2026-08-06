import { Injectable } from "@nestjs/common";

import { EnvironmentProviderGateway } from "../../../data/gateways/environment-provider/environment-provider-gateway";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentStateReason } from "../../../domain/entities/environment/environment-state-reason";

// Worker scenario: prepare the next enqueued environment. Claims it atomically (domain claim() under
// a row lock), provisions the container via the gateway, and marks it dispatched. Returns null when
// the queue is empty so the worker pump knows to stop draining.
@Injectable()
export class PrepareNextEnvironmentUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute(): Promise<Environment | null> {
        const environment = await this.environmentRepository.withNextEnqueued((claimed) => claimed.claim());

        if (!environment) {
            return null;
        }

        try {
            await this.environmentProviderGateway.provision(environment);
            environment.markDispatched();
            await this.environmentRepository.save(environment);
        } catch {
            environment.failProvisioning(EnvironmentStateReason.ProviderError);
            await this.environmentRepository.save(environment);
            await this.deprovisionQuietly(environment);
        }

        return environment;
    }

    private async deprovisionQuietly(environment: Environment): Promise<void> {
        try {
            await this.environmentProviderGateway.deprovision(environment);
        } catch {
            // Best-effort cleanup; a leaked container is caught later by env-id on the next provision/GC.
        }
    }
}
