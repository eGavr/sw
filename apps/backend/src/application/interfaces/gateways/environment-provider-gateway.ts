import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../domain/entities/environment/environment";

// Whether the cloud account is usable with its current settings: reachable under our identity (for a
// delegated cloud, the user has granted us access to their folder), plus a human detail when it is not.
export type CloudReachability = {
    readonly reachable: boolean;
    readonly detail?: string;
};

// Driven port over the external system that runs environments (Docker now, a cloud later).
// It actuates containers/VMs; it is NOT a repository (it does not store our aggregates).
// Operational verbs (docker run/remove) live in the backend client behind the adapter.
// provision receives the environment's cloud account so the adapter can read the project's provisioning
// config (image/port/…); it is null when the environment has no bound cloud account.
export abstract class EnvironmentProviderGateway {
    abstract provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void>;

    abstract deprovision(environment: Environment): Promise<void>;

    // Probe whether we can operate this cloud account under our identity — a read-only check the UI runs
    // after connect to show "cloud available". Never throws on an access failure: an unreachable cloud is
    // the expected answer, returned as { reachable: false, detail }.
    abstract checkAccess(cloudAccount: CloudAccount): Promise<CloudReachability>;
}
