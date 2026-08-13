import { Application } from "./application/application";
import { EnvironmentState } from "./environment-state";
import { Execution } from "./execution";

export type AllocatableEnvironmentPredicate = {
    readonly state: EnvironmentState;
    readonly busy: boolean;
    readonly heartbeatCutoff: Date;
    readonly execution: Execution;
    readonly applicationName: string;
    readonly applicationVersion: string;
};

export type SessionAllocationParams = {
    readonly now: Date;
    readonly freshnessMs: number;
    readonly execution: Execution;
    readonly application: Application;
};

// Which environments a session may be allocated onto: `executing`, not busy, with a fresh heartbeat, on
// the requested execution substrate, and offering the requested application. What "free" and "fresh" mean
// is a domain decision expressed here as a ready predicate; the data source only translates it into a
// query — no state set, busy rule or freshness threshold is baked into the SQL.
export class SessionAllocationCriteria {
    static from(params: SessionAllocationParams): SessionAllocationCriteria {
        return new SessionAllocationCriteria({
            state: EnvironmentState.Executing,
            busy: false,
            heartbeatCutoff: new Date(params.now.getTime() - params.freshnessMs),
            execution: params.execution,
            applicationName: params.application.name,
            applicationVersion: params.application.version,
        });
    }

    private constructor(private readonly predicate: AllocatableEnvironmentPredicate) {}

    toPredicate(): AllocatableEnvironmentPredicate {
        return this.predicate;
    }
}
