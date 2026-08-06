import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentStateReason } from "../../../domain/entities/environment/environment-state-reason";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { EnvironmentProviderGatewayResolver } from "../../interfaces/gateways/environment-provider-gateway-resolver";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";

// Worker scenario: prepare the next enqueued environment. Claims it atomically (domain claim() under
// a row lock), provisions the container via the account's compute gateway, and marks it dispatched.
// Returns null when the queue is empty so the worker pump knows to stop draining.
@Injectable()
export class PrepareNextEnvironmentUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
        private readonly environmentProviderGatewayResolver: EnvironmentProviderGatewayResolver,
    ) {}

    async execute(): Promise<Environment | null> {
        const environment = await this.environmentRepository.withNextEnqueued((claimed) => claimed.claim());

        if (!environment) {
            return null;
        }

        try {
            const gateway = await this.gatewayFor(environment);
            await gateway.provision(environment);
            environment.markDispatched();
            await this.environmentRepository.save(environment);
        } catch {
            environment.failProvisioning(EnvironmentStateReason.ProviderError);
            await this.environmentRepository.save(environment);
            await this.deprovisionQuietly(environment);
        }

        return environment;
    }

    // Route to the compute adapter of the environment's provider account (env → providerAccount →
    // providerType → adapter). The gateway and the repositories are siblings — the use case wires them.
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
            // Best-effort cleanup; a leaked container is caught later by env-id on the next provision/GC.
        }
    }
}
