import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";

// No-op provider: provisions nothing (a null object). Used by integration tests / dry-runs to exercise the
// full environment lifecycle against real Postgres without starting any real container. Registered under
// the "noop" provider key.
export class NoopEnvironmentProviderGateway extends EnvironmentProviderGateway {
    provision(): Promise<void> {
        return Promise.resolve();
    }

    deprovision(): Promise<void> {
        return Promise.resolve();
    }
}
