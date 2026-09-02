import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding } from "../../../domain/entities/cloud-account/compute-binding";
import { Environment } from "../../../domain/entities/environment/environment";

// Whether one compute binding is usable with its current settings: reachable under our identity (for a
// delegated cloud, the user has granted us access to what the binding names), plus a human detail when
// it is not.
export type CloudReachability = {
    readonly reachable: boolean;
    readonly detail?: string;
};

// Driven port over the external system that runs environments (Docker now, a cloud later).
// It actuates containers/VMs; it is NOT a repository (it does not store our aggregates).
// Operational verbs (docker run/remove) live in the backend client behind the adapter.
// provision and deprovision receive the environment's cloud account so the adapter can read the
// substrate binding's provisioning config (folder/cluster/image/…); it is null when the environment has
// no bound cloud account. deprovision must tear down in the same place it provisioned (the binding's
// folder), or the VM leaks.
export abstract class EnvironmentProviderGateway {
    abstract provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void>;

    abstract deprovision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void>;

    // Probe whether we can operate what this binding names, under our identity — a read-only check the
    // UI runs per platform row to show "available". Never throws on an access failure: an unreachable
    // binding is the expected answer while the user has not run the grants yet, returned as
    // { reachable: false, detail }.
    abstract checkAccess(cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability>;
}
