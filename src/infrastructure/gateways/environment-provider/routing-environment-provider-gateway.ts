import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";
import { Environment } from "../../../domain/entities/environment/environment";
import { InternalError } from "../../../domain/entities/error/internal-error";
import { ProviderAccount } from "../../../domain/entities/provider-account/provider-account";

// One EnvironmentProviderGateway over many backend adapters: each action is routed to the adapter of
// the environment's provider type (captured on the environment at creation), so the worker use cases
// stay unaware of per-project routing and never load the provider project just to pick an adapter.
export class RoutingEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(private readonly gatewaysByProviderType: Map<string, EnvironmentProviderGateway>) {
        super();
    }

    async provision(environment: Environment, providerAccount: ProviderAccount | null): Promise<void> {
        await this.gatewayFor(environment).provision(environment, providerAccount);
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.gatewayFor(environment).deprovision(environment);
    }

    private gatewayFor(environment: Environment): EnvironmentProviderGateway {
        if (!environment.provider) {
            throw new InternalError(`environment ${environment.id}: no provider type to route to`);
        }

        const gateway = this.gatewaysByProviderType.get(environment.provider);

        if (!gateway) {
            throw new InternalError(`compute provider: ${environment.provider}: unknown`);
        }

        return gateway;
    }
}
