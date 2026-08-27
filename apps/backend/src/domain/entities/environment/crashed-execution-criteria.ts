import { EnvironmentState } from "./environment-state";
import { StaleStatePredicate } from "./stuck-provisioning-criteria";

// Which stored environments count as crashed: those still `executing` but whose heartbeat has lapsed —
// the container/agent died without a clean deletion. An executing row's `updated_at` advances with every
// heartbeat, so "in `executing` and untouched past the freshness window" is exactly "its heartbeat went
// stale". The state and the cutoff are a domain decision expressed here as a ready predicate; the data
// source only translates it into a query and never learns the freshness window or which state is live.
export class CrashedExecutionCriteria {
    static from(now: Date, freshnessMs: number): CrashedExecutionCriteria {
        return new CrashedExecutionCriteria([
            { state: EnvironmentState.Executing, cutoff: new Date(now.getTime() - freshnessMs) },
        ]);
    }

    private constructor(private readonly predicates: ReadonlyArray<StaleStatePredicate>) {}

    toPredicates(): ReadonlyArray<StaleStatePredicate> {
        return this.predicates;
    }
}
