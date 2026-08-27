import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../domain/entities/environment/environment";

// Driven port over the external system that runs environments (Docker now, a cloud later).
// It actuates containers/VMs; it is NOT a repository (it does not store our aggregates).
// Operational verbs (docker run/remove) live in the backend client behind the adapter.
// provision receives the environment's cloud account so the adapter can read the project's provisioning
// config (image/port/…); it is null when the environment has no bound cloud account.
export abstract class EnvironmentProviderGateway {
    abstract provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void>;

    abstract deprovision(environment: Environment): Promise<void>;
}
