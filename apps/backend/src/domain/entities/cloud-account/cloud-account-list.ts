import { Execution } from "../environment/execution";

import { CloudAccount } from "./cloud-account";
import { ComputeBinding } from "./compute-binding";

// One connection of the project and the binding of it that serves a substrate — what a placement lands on.
export type Placement = { cloudAccount: CloudAccount; binding: ComputeBinding };

// The cloud connections of one project. Which of them can run a given substrate, and in what order they
// are tried, is a domain rule, so it lives here rather than in the use case.
export class CloudAccountList {
    static of(cloudAccounts: ReadonlyArray<CloudAccount>): CloudAccountList {
        return new CloudAccountList(cloudAccounts);
    }

    private constructor(private readonly cloudAccounts: ReadonlyArray<CloudAccount>) {}

    // Every connection that can run this substrate, oldest binding first. Several are legal on purpose —
    // own machines beside a public cloud — and WHICH one an environment goes to is named in the request,
    // never guessed here; this list is what the caller chooses from (and what a refusal lists back).
    // Ties, which only two bindings made in the same millisecond can produce, break by id so the listing
    // is stable.
    candidatesFor(platformName: string, execution: Execution): Array<Placement> {
        return this.cloudAccounts
            .map((cloudAccount) => ({ cloudAccount, binding: cloudAccount.computeBindingFor(platformName, execution) }))
            .filter((candidate): candidate is Placement => Boolean(candidate.binding))
            .sort((left, right) =>
                left.binding.createdAt.getTime() - right.binding.createdAt.getTime()
                || left.binding.id.localeCompare(right.binding.id));
    }

    // The placement on the named cloud, when that cloud is this project's and runs the asked substrate.
    // The name is either address — the word chosen at connect or the uid — and a cloud binds a substrate
    // at most once, so naming the cloud names the binding.
    on(cloudAccountHandle: string, platformName: string, execution: Execution): Placement | null {
        return this.candidatesFor(platformName, execution)
            .find(({ cloudAccount }) => cloudAccount.isAddressedBy(cloudAccountHandle)) ?? null;
    }
}
