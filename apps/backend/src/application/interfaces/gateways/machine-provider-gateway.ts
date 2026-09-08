import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";

import { CloudReachability, OwnershipVerification } from "./environment-provider-gateway";

// The kind-specific, non-secret settings of the binding a pool serves (e.g. the user's folderId).
// Opaque here — the concrete provider adapter interprets it.
export type MachineProviderConfig = Record<string, unknown>;

// Driven port over the cloud that rents whole big machines for a machine pool. This is deliberately NOT
// the per-environment compute port: the pool orders and returns machines on its own clock (a machine
// hosts many environments over its life). One adapter per cloud/offering — a new cloud with big
// machines plugs in here and the pool logic never changes.
export abstract class MachineProviderGateway {
    // Order the machine (idempotent per host: retrying an accepted order is a no-op). Where it is
    // ordered comes from host.providerContext, written at ordering time — so the machine can always be
    // torn down in the same place even if the binding's config changed meanwhile.
    abstract provision(lease: MachineLease): Promise<void>;

    // Return the machine to the cloud (idempotent: already-gone is success — deprovision must never
    // leave a machine because it was "too gone to delete"). Addressed by host id + whereabouts rather
    // than the aggregate: the orphan sweep returns machines NO pool row knows anymore.
    abstract deprovision(leaseId: string, config: MachineProviderConfig): Promise<void>;

    // The ids of every machine currently leased under our label in this location — the orphan sweep's
    // eyes: a machine labelled ours that no pool row knows is a leak, and leaked metal costs money.
    abstract listLeaseIds(config: MachineProviderConfig): Promise<Array<string>>;

    // Read-only probes for the binding's availability badge and the per-project ownership gate; both
    // report failure as data, never as an exception. How ownership is proven is the adapter's business
    // (a folder label on a delegated cloud; nothing at all on the operator's own machine) — the caller
    // only supplies the project's marker key.
    abstract checkAccess(config: MachineProviderConfig): Promise<CloudReachability>;

    abstract verifyOwnership(config: MachineProviderConfig, markerKey: string): Promise<OwnershipVerification>;
}
