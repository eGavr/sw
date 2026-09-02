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

// One way a cloud can run a substrate: the kind's name, the binding-config keys it requires (e.g.
// clusterId for kubernetes, folderId for vm) and the grants it needs.
export type ComputeKindOffer = {
    readonly kind: string;
    readonly requiredConfig: ReadonlyArray<ConfigRequirement>;
    readonly grants: ReadonlyArray<CloudGrant>;
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
