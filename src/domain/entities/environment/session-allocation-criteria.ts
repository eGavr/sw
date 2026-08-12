import { Application } from "./application/application";
import { EnvironmentState } from "./environment-state";

export type AllocatableEnvironmentPredicate = {
    readonly state: EnvironmentState;
    readonly busy: boolean;
    readonly heartbeatCutoff: Date;
    readonly applicationName: string;
    readonly applicationVersion: string;
};

// Which environments a session may be allocated onto: `executing`, not busy, with a fresh heartbeat,
// and offering the requested application. What "free" and "fresh" mean is a domain decision expressed
// here as a ready predicate; the data source only translates it into a query — no state set, busy rule
// or freshness threshold is baked into the SQL.
export class SessionAllocationCriteria {
    static from(now: Date, freshnessMs: number, application: Application): SessionAllocationCriteria {
        return new SessionAllocationCriteria({
            state: EnvironmentState.Executing,
            busy: false,
            heartbeatCutoff: new Date(now.getTime() - freshnessMs),
            applicationName: application.name,
            applicationVersion: application.version,
        });
    }

    private constructor(private readonly predicate: AllocatableEnvironmentPredicate) {}

    toPredicate(): AllocatableEnvironmentPredicate {
        return this.predicate;
    }
}
