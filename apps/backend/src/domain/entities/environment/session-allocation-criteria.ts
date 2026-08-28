import { latestApplicationVersion } from "./application/application-version";
import { RequestedApplication } from "./application/requested-application";
import { Environment } from "./environment";
import { EnvironmentState } from "./environment-state";
import {
    IncompatibleSessionTargetError,
} from "./error/incompatible-session-target-error";
import {
    NoAllocatableEnvironmentError,
} from "./error/no-allocatable-environment-error";
import {
    NoEnvironmentOffersApplicationError,
} from "./error/no-environment-offers-application-error";
import {
    TargetEnvironmentNotReadyError,
} from "./error/target-environment-not-ready-error";
import { Execution } from "./execution";

export type AllocatableEnvironmentPredicate = {
    readonly state: EnvironmentState;
    readonly busy: boolean;
    readonly heartbeatCutoff: Date;
    readonly execution: Execution;
    readonly applicationName: string;
    readonly applicationVersion: string | null;
};

export type SessionAllocationParams = {
    readonly now: Date;
    readonly freshnessMs: number;
    readonly execution: Execution;
    readonly application: RequestedApplication;
};

export type OfferedApplicationPredicate = {
    readonly states: ReadonlyArray<EnvironmentState>;
    readonly execution: Execution;
    readonly applicationName: string;
    readonly applicationVersion: string | null;
};

// The lifecycle states in which an environment will (eventually) serve sessions: anything alive on its
// way to or in `executing`. failed/deleting/deleted cannot recover, so their presence does not make a
// retry useful.
const statesEventuallyServing: ReadonlyArray<EnvironmentState> = [
    EnvironmentState.Enqueued,
    EnvironmentState.Starting,
    EnvironmentState.Preparing,
    EnvironmentState.Executing,
];

// Which environments a session may be allocated onto: `executing`, not busy, with a fresh heartbeat, on
// the requested execution substrate, and offering the requested application. What "free" and "fresh" mean
// is a domain decision expressed here as a ready predicate; the data source only translates it into a
// query. A null `applicationVersion` means "latest" — match by name and let `rank` order by newest.
export class SessionAllocationCriteria {
    static from(params: SessionAllocationParams): SessionAllocationCriteria {
        return new SessionAllocationCriteria(params.application, {
            state: EnvironmentState.Executing,
            busy: false,
            heartbeatCutoff: new Date(params.now.getTime() - params.freshnessMs),
            execution: params.execution,
            applicationName: params.application.name,
            applicationVersion: params.application.version(),
        });
    }

    private constructor(
        private readonly application: RequestedApplication,
        private readonly predicate: AllocatableEnvironmentPredicate,
    ) {}

    toPredicate(): AllocatableEnvironmentPredicate {
        return this.predicate;
    }

    // The relaxed "could this pool ever serve the request" predicate: same application and substrate,
    // but any state that still leads to executing and no free/fresh demand.
    toOfferPredicate(): OfferedApplicationPredicate {
        return {
            states: statesEventuallyServing,
            execution: this.predicate.execution,
            applicationName: this.predicate.applicationName,
            applicationVersion: this.predicate.applicationVersion,
        };
    }

    // Why an empty pool is refused: with something offering the request, the shortage is transient
    // (busy/provisioning — retry helps); with nothing offering it, only creating an environment will —
    // a failed precondition, not a conflict.
    refuseAllocation(anythingOffers: boolean): never {
        const version = this.application.version() ?? latestApplicationVersion;

        if (anythingOffers) {
            throw new NoAllocatableEnvironmentError(this.application.name, version);
        }

        throw new NoEnvironmentOffersApplicationError(this.application.name, version, this.predicate.execution);
    }

    // The same rule as the pool predicate, enforced against one targeted environment. Refusal splits
    // honestly: a target that can never serve the request (wrong application/version/substrate) is an
    // invalid request; one that merely cannot right now (provisioning/busy/stale) is a transient conflict.
    admit(environment: Environment): void {
        if (!this.offersRequested(environment)) {
            throw new IncompatibleSessionTargetError(
                environment.id,
                this.application.name,
                this.application.version() ?? latestApplicationVersion,
            );
        }

        if (!this.isReady(environment)) {
            throw new TargetEnvironmentNotReadyError(environment.id);
        }
    }

    private offersRequested(environment: Environment): boolean {
        const application = environment.applicationFor(this.predicate.applicationName);

        if (!application || environment.execution !== this.predicate.execution) {
            return false;
        }

        return this.predicate.applicationVersion === null
            || application.version === this.predicate.applicationVersion;
    }

    private isReady(environment: Environment): boolean {
        return environment.state === this.predicate.state
            && environment.busy === this.predicate.busy
            && environment.lastHeartbeatAt !== null
            && environment.lastHeartbeatAt >= this.predicate.heartbeatCutoff;
    }

    // The order matched candidates should be tried in. An exact-version request matched a single version,
    // so the data source's (random) load spread is kept; a "latest" request prefers the newest installed
    // version first, ties keeping that spread (the sort is stable).
    rank(environments: Array<Environment>): Array<Environment> {
        if (!this.application.isLatest()) {
            return environments;
        }

        const name = this.application.name;

        return [...environments].sort((left, right) => {
            const leftApplication = left.applicationFor(name);
            const rightApplication = right.applicationFor(name);

            if (!leftApplication || !rightApplication) {
                return 0;
            }

            return rightApplication.compareVersion(leftApplication);
        });
    }
}
