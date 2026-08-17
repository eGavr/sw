import { ProviderCatalog } from "../../../application/interfaces/provider-catalog";

// The set of provider keys the routing gateway has adapters registered for.
export class RegisteredProviderCatalog extends ProviderCatalog {
    private readonly providers: ReadonlySet<string>;

    constructor(providers: ReadonlyArray<string>) {
        super();
        this.providers = new Set(providers);
    }

    supports(provider: string): boolean {
        return this.providers.has(provider);
    }

    list(): ReadonlyArray<string> {
        return [...this.providers];
    }
}
