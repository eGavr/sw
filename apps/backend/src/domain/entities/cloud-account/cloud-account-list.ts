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

    // Every connection that can run this substrate, in the order they are tried: the first one bound is
    // the primary, the rest are what a full primary spills onto (ties, which only two bindings made in
    // the same millisecond can produce, break by id so the order is never a coin toss). Several are
    // legal on purpose — own machines for the baseline and a public cloud for the peaks, or one cloud
    // standing in while another is unreachable.
    candidatesFor(platformName: string, execution: Execution): Array<Placement> {
        return this.cloudAccounts
            .map((cloudAccount) => ({ cloudAccount, binding: cloudAccount.computeBindingFor(platformName, execution) }))
            .filter((candidate): candidate is Placement => Boolean(candidate.binding))
            .sort((left, right) =>
                left.binding.createdAt.getTime() - right.binding.createdAt.getTime()
                || left.binding.id.localeCompare(right.binding.id));
    }

    // The named binding, when it belongs to this project and serves the asked substrate — a placement the
    // caller pinned rather than left to the order.
    pinnedTo(bindingId: string, platformName: string, execution: Execution): Placement | null {
        return this.candidatesFor(platformName, execution).find(({ binding }) => binding.id === bindingId) ?? null;
    }
}
