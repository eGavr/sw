import { Environment } from "../../../domain/entities/environment/environment";

// Driven port over the external system that runs environments (Docker now, a cloud later).
// It actuates containers/VMs; it is NOT a repository (it does not store our aggregates).
// Operational verbs (docker run/remove) live in the backend client behind the adapter.
export abstract class EnvironmentProviderGateway {
    abstract provision(environment: Environment): Promise<void>;

    abstract deprovision(environment: Environment): Promise<void>;
}
