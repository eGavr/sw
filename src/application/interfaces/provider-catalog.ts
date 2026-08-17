// Driven port telling which compute providers this installation has an adapter for. Lets create-project
// reject an unknown provider up front (fail-fast) instead of failing later at provision time.
export abstract class ProviderCatalog {
    abstract supports(provider: string): boolean;

    abstract list(): ReadonlyArray<string>;
}
