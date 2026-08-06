import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";
import {
    EnvironmentProviderGatewayResolver,
} from "../../../application/interfaces/gateways/environment-provider-gateway-resolver";
import { InternalError } from "../../../domain/entities/error/internal-error";

export class EnvironmentProviderGatewayResolverImpl extends EnvironmentProviderGatewayResolver {
    constructor(private readonly gateways: Map<string, EnvironmentProviderGateway>) {
        super();
    }

    resolve(providerType: string): EnvironmentProviderGateway {
        const gateway = this.gateways.get(providerType);

        if (!gateway) {
            throw new InternalError(`compute provider: ${providerType}: unknown`);
        }

        return gateway;
    }
}
