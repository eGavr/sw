import { PoolHost } from "../../../domain/entities/host-pool/pool-host";

import { CloudReachability } from "./environment-provider-gateway";

// The kind-specific, non-secret settings of the binding a pool serves (e.g. the user's folderId).
// Opaque here — the concrete provider adapter interprets it.
export type HostProviderConfig = Record<string, unknown>;

// Driven port over the cloud that rents whole big machines for a host pool. This is deliberately NOT
// the per-environment compute port: the pool orders and returns machines on its own clock (a machine
// hosts many environments over its life). One adapter per cloud/offering — a new cloud with big
// machines plugs in here and the pool logic never changes.
export abstract class HostProviderGateway {
    // Order the machine (idempotent per host: retrying an accepted order is a no-op). Where it is
    // ordered comes from host.providerContext, written at ordering time — so the machine can always be
    // torn down in the same place even if the binding's config changed meanwhile.
    abstract provision(host: PoolHost): Promise<void>;

    // Return the machine to the cloud (idempotent: already-gone is success — deprovision must never
    // leave a machine because it was "too gone to delete").
    abstract deprovision(host: PoolHost): Promise<void>;

    // Read-only probes for the binding's availability badge and the per-project ownership gate; both
    // report failure as data, never as an exception.
    abstract checkAccess(config: HostProviderConfig): Promise<CloudReachability>;

    abstract ownershipLabels(config: HostProviderConfig): Promise<Record<string, string>>;
}
