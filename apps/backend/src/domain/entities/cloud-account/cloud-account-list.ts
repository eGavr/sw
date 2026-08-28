import { Execution } from "../environment/execution";

import { CloudAccount } from "./cloud-account";

// The cloud connections of one project. Which cloud provisions a given environment, and whether a new
// cloud would make routing ambiguous, are domain rules — so they live here, not in the use case.
export class CloudAccountList {
    static of(cloudAccounts: ReadonlyArray<CloudAccount>): CloudAccountList {
        return new CloudAccountList(cloudAccounts);
    }

    private constructor(private readonly cloudAccounts: ReadonlyArray<CloudAccount>) {}

    // The cloud account that provisions this substrate — at most one, since a project keeps its clouds
    // non-overlapping (see conflictWith).
    resolveFor(platformName: string, execution: Execution): CloudAccount | null {
        return this.cloudAccounts.find((cloudAccount) => cloudAccount.supports(platformName, execution)) ?? null;
    }

    // The cloud account whose substrates overlap the candidate's, if any — used to reject a second cloud
    // that would make some (platform, execution) ambiguous.
    conflictWith(candidate: CloudAccount): CloudAccount | null {
        return this.cloudAccounts.find((cloudAccount) => cloudAccount.overlaps(candidate)) ?? null;
    }
}
