import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentState } from "../../../domain/entities/environment/environment-state";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { EnvironmentProviderGatewayResolver } from "../../interfaces/gateways/environment-provider-gateway-resolver";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";

// Worker scenario: stop the containers of environments the user asked to delete. Idempotent — the
// row stays `deleting` (GC removes it once the heartbeat is stale), so re-running is a cheap no-op.
@Injectable()
export class DeprovisionDeletingEnvironmentsUseCase {
    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
        private readonly environmentProviderGatewayResolver: EnvironmentProviderGatewayResolver,
    ) {}

    async execute(): Promise<void> {
        const environments = await this.environmentRepository.listByState(EnvironmentState.Deleting);

        await Promise.all(environments.map((environment) => this.deprovisionQuietly(environment)));
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
            // Best-effort; still `deleting`, so the next cycle retries the deprovision.
        }
    }
}
