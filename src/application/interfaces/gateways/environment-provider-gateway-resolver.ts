import { EnvironmentProviderGateway } from "./environment-provider-gateway";

// Selects the compute adapter for a provider type ("local"/"docker"/…), so provisioning is routed
// per account (env → providerAccount → providerType → adapter) instead of one install-wide provider.
export abstract class EnvironmentProviderGatewayResolver {
    abstract resolve(providerType: string): EnvironmentProviderGateway;
}
