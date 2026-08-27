import { EnvironmentState } from "./environment-state";

export type StaleStatePredicate = {
    readonly state: EnvironmentState;
    readonly cutoff: Date;
};

export type ProvisioningTimeouts = {
    readonly startingMs: number;
    readonly preparingMs: number;
};

// Which stored environments count as stuck in provisioning: those still `starting` or `preparing` but
// untouched past their (per-phase) lease. The set of states and the cutoff arithmetic are a domain
// decision expressed here as ready state+cutoff predicates; the data source only translates them into
// a query and never learns the timeouts or which states mean "provisioning".
export class StuckProvisioningCriteria {
    static from(now: Date, timeouts: ProvisioningTimeouts): StuckProvisioningCriteria {
        return new StuckProvisioningCriteria([
            { state: EnvironmentState.Starting, cutoff: new Date(now.getTime() - timeouts.startingMs) },
            { state: EnvironmentState.Preparing, cutoff: new Date(now.getTime() - timeouts.preparingMs) },
        ]);
    }

    private constructor(private readonly predicates: ReadonlyArray<StaleStatePredicate>) {}

    toPredicates(): ReadonlyArray<StaleStatePredicate> {
        return this.predicates;
    }
}
