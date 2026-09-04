import { EnvironmentState } from "./environment-state";

export type StaleStatePredicate = {
    readonly state: EnvironmentState;
    readonly cutoff: Date;
    // Narrow the predicate to one compute kind, or exclude kinds that carry their own predicate.
    readonly computeKind?: string;
    readonly excludeComputeKinds?: ReadonlyArray<string>;
};

export type ProvisioningTimeouts = {
    readonly startingMs: number;
    readonly preparingMs: number;
};

// A compute kind whose `preparing` phase is legitimately slower than the default (e.g. baremetal — a
// physical machine takes minutes to be handed over, not seconds).
export type PreparingTimeoutOverride = {
    readonly kind: string;
    readonly preparingMs: number;
};

// Which stored environments count as stuck in provisioning: those still `starting` or `preparing` but
// untouched past their (per-phase) lease. `preparing` covers the whole hand-over to the compute backend,
// and backends differ wildly in how long that legitimately takes — so a kind may override its preparing
// lease, and the default preparing predicate then excludes that kind. The set of states, the cutoff
// arithmetic and the kind split are a domain decision expressed here as ready predicates; the data
// source only translates them into a query and never learns the timeouts or which states mean
// "provisioning".
export class StuckProvisioningCriteria {
    static from(
        now: Date,
        timeouts: ProvisioningTimeouts,
        preparingOverrides: ReadonlyArray<PreparingTimeoutOverride> = [],
    ): StuckProvisioningCriteria {
        const overriddenKinds = preparingOverrides.map((override) => override.kind);

        return new StuckProvisioningCriteria([
            { state: EnvironmentState.Starting, cutoff: new Date(now.getTime() - timeouts.startingMs) },
            {
                state: EnvironmentState.Preparing,
                cutoff: new Date(now.getTime() - timeouts.preparingMs),
                ...(overriddenKinds.length > 0 ? { excludeComputeKinds: overriddenKinds } : {}),
            },
            ...preparingOverrides.map((override) => ({
                state: EnvironmentState.Preparing,
                cutoff: new Date(now.getTime() - override.preparingMs),
                computeKind: override.kind,
            })),
        ]);
    }

    private constructor(private readonly predicates: ReadonlyArray<StaleStatePredicate>) {}

    toPredicates(): ReadonlyArray<StaleStatePredicate> {
        return this.predicates;
    }
}
