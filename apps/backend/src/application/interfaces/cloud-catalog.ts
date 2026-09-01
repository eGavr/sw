import { Stereotype } from "../../domain/entities/cloud-account/stereotype";

// A role the user must grant to one of OUR published service identities on their own cloud before the
// connection works (delegated BYOC — we hold no user secrets, they authorize our identity instead).
export type CloudGrant = {
    readonly role: string;
    readonly serviceAccountId: string;
    readonly purpose: string;
};

// What connecting a cloud of this type requires from the user: the config keys that must be supplied
// (e.g. the folder we provision into — without it a delegated cloud would silently fall back to the
// operator's own folder and bill the operator), and the grants to set up on their side.
export type CloudConnectRequirements = {
    readonly requiredConfig: ReadonlyArray<string>;
    readonly grants: ReadonlyArray<CloudGrant>;
};

// Driven port: the cloud types this installation can connect to and, for each, the (platform, execution)
// substrates it provisions. connect-cloud-account validates the type here and materialises `provides` from
// it into the CloudAccount — so the domain never has to know cloud types.
export abstract class CloudCatalog {
    abstract supports(type: string): boolean;

    abstract providesFor(type: string): ReadonlyArray<Stereotype>;

    abstract types(): ReadonlyArray<string>;

    abstract connectRequirementsFor(type: string): CloudConnectRequirements;
}
