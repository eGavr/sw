import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";

// Local/dev provider: starts no real container (the worker path is exercised end-to-end with Docker).
// Kept so COMPUTE_PROVIDER=local wires a valid gateway.
export class LocalEnvironmentProviderGateway extends EnvironmentProviderGateway {
    provision(): Promise<void> {
        return Promise.resolve();
    }

    deprovision(): Promise<void> {
        return Promise.resolve();
    }
}
