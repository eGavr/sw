import { Execution } from "../environment/execution";

import { CloudAccount } from "./cloud-account";
import { ComputeBinding } from "./compute-binding";

// The cloud connections of one project. Which connection runs a given substrate — and whether a new
// binding would make that ambiguous — are domain rules, so they live here, not in the use case.
export class CloudAccountList {
    static of(cloudAccounts: ReadonlyArray<CloudAccount>): CloudAccountList {
        return new CloudAccountList(cloudAccounts);
    }

    private constructor(private readonly cloudAccounts: ReadonlyArray<CloudAccount>) {}

    // The connection and binding serving this substrate — at most one across the project, since bindings
    // are kept substrate-unique (see isBound).
    resolveFor(
        platformName: string,
        execution: Execution,
    ): { cloudAccount: CloudAccount; binding: ComputeBinding } | null {
        for (const cloudAccount of this.cloudAccounts) {
            const binding = cloudAccount.computeBindingFor(platformName, execution);

            if (binding) {
                return { cloudAccount, binding };
            }
        }

        return null;
    }

    // Whether any connection of the project already binds this substrate — a second binding anywhere
    // would make routing ambiguous.
    isBound(platformName: string, execution: Execution): boolean {
        return this.resolveFor(platformName, execution) !== null;
    }
}
