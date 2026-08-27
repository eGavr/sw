import { Stereotype } from "../../domain/entities/cloud-account/stereotype";

// Driven port: the cloud types this installation can connect to and, for each, the (platform, execution)
// substrates it provisions. connect-cloud-account validates the type here and materialises `provides` from
// it into the CloudAccount — so the domain never has to know cloud types.
export abstract class CloudCatalog {
    abstract supports(type: string): boolean;

    abstract providesFor(type: string): ReadonlyArray<Stereotype>;

    abstract types(): ReadonlyArray<string>;
}
