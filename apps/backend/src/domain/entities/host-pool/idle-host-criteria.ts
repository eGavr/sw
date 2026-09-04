import { PoolHostState } from "./pool-host-state";

export type IdleHostPredicate = {
    readonly states: ReadonlyArray<PoolHostState>;
    readonly emptiedBefore: Date;
    readonly mustBeEmpty: true;
};

// Which hosts count as idle: ready machines that hold no seats and have stayed empty past the pool's
// TTL — lingering is the point (the next environment starts in seconds), but past the TTL the machine
// only burns money. The state set and the cutoff arithmetic are the domain decision; the data source
// only translates them.
export class IdleHostCriteria {
    static from(now: Date, idleTtlMs: number): IdleHostCriteria {
        return new IdleHostCriteria({
            states: [PoolHostState.Ready],
            emptiedBefore: new Date(now.getTime() - idleTtlMs),
            mustBeEmpty: true,
        });
    }

    private constructor(private readonly predicate: IdleHostPredicate) {}

    toPredicate(): IdleHostPredicate {
        return this.predicate;
    }
}
