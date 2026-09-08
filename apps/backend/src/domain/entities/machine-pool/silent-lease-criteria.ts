import { MachineLeaseState } from "./machine-lease-state";

export type SilentHostPredicate = {
    readonly states: ReadonlyArray<MachineLeaseState>;
    readonly lastSeenBefore: Date;
};

// Which hosts count as silent: ready machines whose agent stopped checking in past the allowance
// (the agent polls every few seconds — a minute of silence means the machine, its network or the
// agent is gone). Only `ready` is judged: `ordering` has not checked in yet by definition, `failed`
// is already silent, `deleting` is on its way out.
export class SilentLeaseCriteria {
    static from(now: Date, silenceAllowanceMs: number): SilentLeaseCriteria {
        return new SilentLeaseCriteria({
            states: [MachineLeaseState.Ready],
            lastSeenBefore: new Date(now.getTime() - silenceAllowanceMs),
        });
    }

    private constructor(private readonly predicate: SilentHostPredicate) {}

    toPredicate(): SilentHostPredicate {
        return this.predicate;
    }
}
