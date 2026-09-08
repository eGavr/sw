import { MachineState } from "./machine-state";

export type SilentMachinePredicate = {
    readonly state: MachineState;
    readonly lastSyncBefore: Date;
};

// Which online machines count as silent: the agent syncs every few seconds, so a sync older than the
// allowance means the machine, its network or the agent is gone. A silent machine is only marked
// offline — it comes back on its own on the next sync; its lease's fate is the pool's business.
export class SilentMachineCriteria {
    static from(now: Date, silenceAllowanceMs: number): SilentMachineCriteria {
        return new SilentMachineCriteria({
            state: MachineState.Online,
            lastSyncBefore: new Date(now.getTime() - silenceAllowanceMs),
        });
    }

    private constructor(private readonly predicate: SilentMachinePredicate) {}

    toPredicate(): SilentMachinePredicate {
        return this.predicate;
    }
}
