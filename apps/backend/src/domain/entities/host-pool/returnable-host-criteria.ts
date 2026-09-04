import { PoolHostState } from "./pool-host-state";

export type ReturnableHostPredicate = {
    readonly states: ReadonlyArray<PoolHostState>;
    readonly mustBeEmpty: true;
};

// Which hosts are ready to be handed back to the cloud: chosen for return (`deleting`) or written off
// (`failed`) — and EMPTY. A failed machine with seats still waits: its workloads die on their own
// clocks (the environments' reapers), and only then is the machine returned.
export class ReturnableHostCriteria {
    static create(): ReturnableHostCriteria {
        return new ReturnableHostCriteria({
            states: [PoolHostState.Deleting, PoolHostState.Failed],
            mustBeEmpty: true,
        });
    }

    private constructor(private readonly predicate: ReturnableHostPredicate) {}

    toPredicate(): ReturnableHostPredicate {
        return this.predicate;
    }
}
