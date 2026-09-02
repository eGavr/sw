import { Stereotype } from "../../domain/entities/cloud-account/stereotype";

// A role the user must grant to one of OUR published service identities on their own cloud before the
// connection (or a specific compute kind) works — delegated BYOC: we hold no user secrets, they authorize
// our identity instead.
export type CloudGrant = {
    readonly role: string;
    readonly serviceAccountId: string;
};

// One way a cloud can run a substrate: the kind's name, the binding-config keys it requires (e.g.
// clusterId for kubernetes) and the extra grants it needs.
export type ComputeKindOffer = {
    readonly kind: string;
    readonly requiredConfig: ReadonlyArray<string>;
    readonly grants: ReadonlyArray<CloudGrant>;
};

// A substrate the cloud offers plus every kind that can run it. More than one kind means the user must
// pick when binding; exactly one configless kind means the binding can be created automatically.
export type SubstrateOffer = {
    readonly stereotype: Stereotype;
    readonly compute: ReadonlyArray<ComputeKindOffer>;
};

// What connecting a cloud of this type requires from the user at the account level: config keys (e.g.
// the folder we provision into) and the account-level grants.
export type CloudConnectRequirements = {
    readonly requiredConfig: ReadonlyArray<string>;
    readonly grants: ReadonlyArray<CloudGrant>;
};

// Driven port: the cloud types this installation can connect to and, for each, the substrates it offers
// with their compute kinds. connect validates types/kinds here; the domain stays cloud-agnostic.
export abstract class CloudCatalog {
    abstract supports(type: string): boolean;

    abstract types(): ReadonlyArray<string>;

    abstract substrateOffers(type: string): ReadonlyArray<SubstrateOffer>;

    abstract connectRequirementsFor(type: string): CloudConnectRequirements;
}
