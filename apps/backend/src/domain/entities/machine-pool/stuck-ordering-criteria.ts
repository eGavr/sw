import { MachineLeaseState } from "./machine-lease-state";

export type StuckOrderingPredicate = {
    readonly state: MachineLeaseState;
    readonly createdBefore: Date;
};

// Which hosts count as stuck in ordering: machines requested from the cloud whose agent never checked
// in past the hand-over allowance (a physical machine takes minutes — but not this long). The first
// check-in flips a host to `ready`, so age in `ordering` is exactly "how long we have been waiting".
export class StuckOrderingCriteria {
    static from(now: Date, orderingTimeoutMs: number): StuckOrderingCriteria {
        return new StuckOrderingCriteria({
            state: MachineLeaseState.Ordering,
            createdBefore: new Date(now.getTime() - orderingTimeoutMs),
        });
    }

    private constructor(private readonly predicate: StuckOrderingPredicate) {}

    toPredicate(): StuckOrderingPredicate {
        return this.predicate;
    }
}
