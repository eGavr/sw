import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../domain/entities/environment/environment";

import { CloudCredential } from "./cloud-credential";

// Driven port over the external system that runs environments (Docker now, a cloud later).
// It actuates containers/VMs; it is NOT a repository (it does not store our aggregates).
// Operational verbs (docker run/remove) live in the backend client behind the adapter.
// provision receives the environment's cloud account so the adapter can read the project's provisioning
// config (image/port/…); it is null when the environment has no bound cloud account. It also receives the
// account's resolved credential (secret material) to authenticate to the cloud, already fetched from the
// secret store by the use case — null when the account carries none (e.g. local docker needs no credential).
export abstract class EnvironmentProviderGateway {
    abstract provision(
        environment: Environment,
        cloudAccount: CloudAccount | null,
        credential: CloudCredential | null,
    ): Promise<void>;

    abstract deprovision(environment: Environment): Promise<void>;
}
