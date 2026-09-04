import { PoolHostState } from "./pool-host-state";

export type SilentHostPredicate = {
    readonly states: ReadonlyArray<PoolHostState>;
    readonly lastSeenBefore: Date;
};

// Which hosts count as silent: ready machines whose agent stopped checking in past the allowance
// (the agent polls every few seconds — a minute of silence means the machine, its network or the
// agent is gone). Only `ready` is judged: `ordering` has not checked in yet by definition, `failed`
// is already silent, `deleting` is on its way out.
export class SilentHostCriteria {
    static from(now: Date, silenceAllowanceMs: number): SilentHostCriteria {
        return new SilentHostCriteria({
            states: [PoolHostState.Ready],
            lastSeenBefore: new Date(now.getTime() - silenceAllowanceMs),
        });
    }

    private constructor(private readonly predicate: SilentHostPredicate) {}

    toPredicate(): SilentHostPredicate {
        return this.predicate;
    }
}
