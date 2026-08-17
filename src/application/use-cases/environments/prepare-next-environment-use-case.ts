import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentStateReason } from "../../../domain/entities/environment/environment-state-reason";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { Logger } from "../../interfaces/logger";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";

// Worker scenario: prepare the next enqueued environment. Claims it atomically (domain claim() under
// a row lock), provisions the container via the compute gateway (routed by the environment's provider
// type), and marks it dispatched. Returns null when the queue is empty so the pump stops draining.
@Injectable()
export class PrepareNextEnvironmentUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
        private readonly logger: Logger,
    ) {}

    async execute(): Promise<Environment | null> {
        const environment = await this.environmentRepository.withNextEnqueued((claimed) => claimed.claim());

        if (!environment) {
            return null;
        }

        this.logger.log(`prepare: provisioning environment ${environment.id}`);

        try {
            await this.environmentProviderGateway.provision(environment);
            environment.markDispatched();
            await this.environmentRepository.save(environment);
            this.logger.log(`prepare: environment ${environment.id} dispatched, awaiting agent`);
        } catch (error) {
            this.logger.error(`prepare: provisioning environment ${environment.id} failed: ${describeError(error)}`);
            environment.failProvisioning(EnvironmentStateReason.ProviderError);
            await this.environmentRepository.save(environment);
            // Best-effort cleanup; a leaked container is caught later by env-id on the next provision/GC.
            await this.environmentProviderGateway.deprovision(environment).catch(() => undefined);
        }

        return environment;
    }
}

function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }

    return String(error);
}
