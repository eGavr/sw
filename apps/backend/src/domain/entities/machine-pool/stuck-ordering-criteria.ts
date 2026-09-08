import { MachineLeaseState } from "./machine-lease-state";

export type StuckOrderingPredicate = {
    readonly states: ReadonlyArray<MachineLeaseState>;
    readonly createdBefore: Date;
};

// Which leases count as stuck before their machine ever arrived: enqueued ones no worker took (a lease
// row that counts toward the cap while nothing provisions it), and ordered ones whose agent never
// checked in past the hand-over allowance (a physical machine takes minutes — but not this long). The
// first check-in flips a lease to `ready`, so age in these states is exactly "how long we have waited".
export class StuckOrderingCriteria {
    static from(now: Date, orderingTimeoutMs: number): StuckOrderingCriteria {
        return new StuckOrderingCriteria({
            states: [MachineLeaseState.Enqueued, MachineLeaseState.Ordering],
            createdBefore: new Date(now.getTime() - orderingTimeoutMs),
        });
    }

    private constructor(private readonly predicate: StuckOrderingPredicate) {}

    toPredicate(): StuckOrderingPredicate {
        return this.predicate;
    }
}
