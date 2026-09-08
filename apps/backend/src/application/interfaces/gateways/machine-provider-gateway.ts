import { Headroom } from "../../../domain/entities/machine-pool/headroom";
import { MachineLease } from "../../../domain/entities/machine-pool/machine-lease";
import { ProvisionedMachine } from "../../../domain/entities/machine-pool/provisioned-machine";

import { CloudReachability, OwnershipVerification } from "./environment-provider-gateway";

// The kind-specific, non-secret settings of the binding a pool serves (e.g. the user's folderId).
// Opaque here — the concrete provider adapter interprets it.
export type MachineProviderConfig = Record<string, unknown>;

// Driven port over the cloud that gives the pool whole big machines. This is deliberately NOT the
// per-environment compute port: the pool takes and returns machines on its own clock (a machine hosts
// many environments over its life). One adapter per cloud — a public cloud leases servers, a
// self-hosted cloud hands out the user's attached machines — and the pool logic never changes.
export abstract class MachineProviderGateway {
    // Get the lease its machine (idempotent per lease: retrying a granted order hands back the same
    // machine). Where it comes from is in lease.providerContext, written at seating time — so the
    // machine can always be returned in the same place even if the binding's config changed meanwhile.
    abstract provision(lease: MachineLease): Promise<ProvisionedMachine>;

    // Return the machine (idempotent: already-gone is success — deprovision must never leave a machine
    // because it was "too gone to delete"). Addressed by lease id + whereabouts rather than the
    // aggregate: the orphan sweep returns machines NO pool row knows anymore.
    abstract deprovision(leaseId: string, config: MachineProviderConfig): Promise<void>;

    // The ids of every lease the cloud still holds a machine for in this location — the orphan sweep's
    // eyes: a machine held for a lease no pool row knows is a leak, and leaked metal costs money.
    abstract listLeaseIds(config: MachineProviderConfig): Promise<Array<string>>;

    // How many more machines the cloud can give this pool right now — read at seating time so no
    // environment is seated on a machine that could never come. A public cloud answers unbounded.
    abstract headroom(config: MachineProviderConfig): Promise<Headroom>;

    // Read-only probes for the binding's availability badge and the per-project ownership gate; both
    // report failure as data, never as an exception. How ownership is proven is the adapter's business
    // (a folder label on a delegated cloud; the user's own agent on their own machine) — the caller
    // only supplies the project's marker key.
    abstract checkAccess(config: MachineProviderConfig): Promise<CloudReachability>;

    abstract verifyOwnership(config: MachineProviderConfig, markerKey: string): Promise<OwnershipVerification>;
}
