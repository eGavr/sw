import { EnvironmentState } from "./environment-state";

export type CollectablePredicate = {
    readonly state: EnvironmentState;
    readonly cutoff: Date;
    readonly timestamp: "lastHeartbeatAt" | "updatedAt";
    readonly collectWhenNull: boolean;
};

export type GarbageCollectionTimeouts = {
    readonly freshnessMs: number;
    readonly failedTtlMs: number;
};

// Which stored environments are collectable (hard delete): a `deleting` one once its container is gone
// (heartbeat stale, or it never sent one), and a `failed` one older than its TTL. The states, the clock
// each is measured by, and the cutoffs are a domain decision expressed here as ready predicates; the
// data source only translates them into a delete.
export class GarbageCollectionCriteria {
    static from(now: Date, timeouts: GarbageCollectionTimeouts): GarbageCollectionCriteria {
        return new GarbageCollectionCriteria([
            {
                state: EnvironmentState.Deleting,
                cutoff: new Date(now.getTime() - timeouts.freshnessMs),
                timestamp: "lastHeartbeatAt",
                collectWhenNull: true,
            },
            {
                state: EnvironmentState.Failed,
                cutoff: new Date(now.getTime() - timeouts.failedTtlMs),
                timestamp: "updatedAt",
                collectWhenNull: false,
            },
        ]);
    }

    private constructor(private readonly predicates: ReadonlyArray<CollectablePredicate>) {}

    toPredicates(): ReadonlyArray<CollectablePredicate> {
        return this.predicates;
    }
}
