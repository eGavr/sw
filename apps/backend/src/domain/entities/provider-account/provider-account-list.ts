import { Execution } from "../environment/execution";

import { ProviderAccount } from "./provider-account";

// The active provider connections of one project. Selecting which one provisions a given environment is a
// domain rule (an project may hold several providers), so it lives here rather than in the use case: the
// environment's (platform, execution) is matched exactly against each connection's served substrate.
export class ProviderAccountList {
    static of(providerAccounts: ReadonlyArray<ProviderAccount>): ProviderAccountList {
        return new ProviderAccountList(providerAccounts);
    }

    private constructor(private readonly providerAccounts: ReadonlyArray<ProviderAccount>) {}

    resolveFor(platformName: string, execution: Execution): ProviderAccount | null {
        return this.providerAccounts.find(
            (providerAccount) => providerAccount.isActive() && providerAccount.serves(platformName, execution),
        ) ?? null;
    }
}
