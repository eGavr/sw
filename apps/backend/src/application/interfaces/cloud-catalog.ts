import { Stereotype } from "../../domain/entities/cloud-account/stereotype";

// A role the user must grant to one of OUR published service identities on their own cloud before the
// compute kind works — delegated BYOC: we hold no user secrets, they authorize our identity instead.
export type CloudGrant = {
    readonly role: string;
    readonly serviceAccountId: string;
};

// One config key a kind requires from the binding, with the format that catches obvious garbage at the
// input (a regex source); whether the value actually exists and is granted is answered by the access
// probe, not here.
export type ConfigRequirement = {
    readonly key: string;
    readonly pattern?: string;
};

// Where the owner places the per-project ownership marker to authorise a project for this kind's
// resource: a label on the cloud folder / managed cluster, or an object in the bucket. `none` means the
// kind needs no proof (e.g. the operator's own local docker). Drives both the setup instructions and the
// gate — an unverified binding cannot provision.
export type OwnershipProof = "folder-label" | "cluster-label" | "none";

// One way a cloud can run a substrate: the kind's name, the binding-config keys it requires (e.g.
// clusterId for kubernetes, folderId for vm), the grants it needs, and how the user proves they own the
// resource this kind provisions into.
export type ComputeKindOffer = {
    readonly kind: string;
    readonly requiredConfig: ReadonlyArray<ConfigRequirement>;
    readonly grants: ReadonlyArray<CloudGrant>;
    readonly ownershipProof: OwnershipProof;
};

// A substrate the cloud offers plus every kind that can run it. More than one kind means the user must
// pick when binding.
export type SubstrateOffer = {
    readonly stereotype: Stereotype;
    readonly compute: ReadonlyArray<ComputeKindOffer>;
};

// Driven port: the cloud types this installation can connect to and, for each, the substrates it offers
// with their compute kinds. Connecting a cloud needs nothing beyond the type — everything the user must
// name or grant belongs to a compute kind's offer. The domain stays cloud-agnostic.
export abstract class CloudCatalog {
    abstract supports(type: string): boolean;

    abstract types(): ReadonlyArray<string>;

    abstract substrateOffers(type: string): ReadonlyArray<SubstrateOffer>;
}
