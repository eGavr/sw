import { ApplicationMatch } from "./application/application-match";
import { latestApplicationVersion } from "./application/application-version";
import { RequestedApplication } from "./application/requested-application";
import { Environment } from "./environment";
import { EnvironmentOccupancy } from "./environment-occupancy";
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
    readonly occupancy: EnvironmentOccupancy;
    readonly heartbeatCutoff: Date;
    readonly execution: Execution;
    readonly applicationNames: ReadonlyArray<string>;
    readonly applicationVersionPrefix: string | null;
};

export type SessionAllocationParams = {
    readonly now: Date;
    readonly freshnessMs: number;
    readonly execution: Execution;
    readonly application: RequestedApplication;
    readonly match: ApplicationMatch;
};

export type OfferedApplicationPredicate = {
    readonly states: ReadonlyArray<EnvironmentState>;
    readonly execution: Execution;
    readonly applicationNames: ReadonlyArray<string>;
    readonly applicationVersionPrefix: string | null;
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

// Which environments a session may be allocated onto: `executing`, free, with a fresh agent heartbeat,
// on the requested execution substrate, and offering the requested application. What "free" and "fresh"
// mean is a domain decision expressed here as a ready predicate; the data source only translates it into
// a query. The request arrives expanded into an ApplicationMatch: candidate names (alias-aware) and a
// version segment prefix, null meaning "latest" — match by name and let `rank` order by newest.
export class SessionAllocationCriteria {
    static from(params: SessionAllocationParams): SessionAllocationCriteria {
        return new SessionAllocationCriteria(params.application, params.match, {
            state: EnvironmentState.Executing,
            occupancy: EnvironmentOccupancy.Free,
            heartbeatCutoff: new Date(params.now.getTime() - params.freshnessMs),
            execution: params.execution,
            applicationNames: params.match.names,
            applicationVersionPrefix: params.match.versionPrefix,
        });
    }

    private constructor(
        private readonly application: RequestedApplication,
        private readonly match: ApplicationMatch,
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
            applicationNames: this.predicate.applicationNames,
            applicationVersionPrefix: this.predicate.applicationVersionPrefix,
        };
    }

    // Why an empty pool is refused: with something offering the request, the shortage is transient
    // (busy/provisioning — retry helps); with nothing offering it, only creating an environment will —
    // a failed precondition, not a conflict.
    refuseAllocation(anythingOffers: boolean): never {
        if (anythingOffers) {
            this.refuseTransientShortage();
        }

        throw new NoEnvironmentOffersApplicationError(
            this.application.name,
            this.requestedVersion(),
            this.predicate.execution,
        );
    }

    // The pool provably offers the request but nothing is takable right now (busy, or every listed
    // candidate was reserved in the race) — a retryable conflict.
    refuseTransientShortage(): never {
        throw new NoAllocatableEnvironmentError(this.application.name, this.requestedVersion());
    }

    // The same rule as the pool predicate, enforced against one targeted environment. Refusal splits
    // honestly: a target that can never serve the request (wrong application/version/substrate) is an
    // invalid request; one that merely cannot right now (provisioning/busy/stale) is a transient conflict.
    admit(environment: Environment): void {
        if (!this.offersRequested(environment)) {
            throw new IncompatibleSessionTargetError(environment.id, this.application.name, this.requestedVersion());
        }

        if (!this.isReady(environment)) {
            throw new TargetEnvironmentNotReadyError(environment.id);
        }
    }

    private requestedVersion(): string {
        return this.application.version() ?? latestApplicationVersion;
    }

    private offersRequested(environment: Environment): boolean {
        return environment.execution === this.predicate.execution
            && environment.applicationMatching(this.match) !== null;
    }

    private isReady(environment: Environment): boolean {
        return environment.state === this.predicate.state
            && environment.occupancy === this.predicate.occupancy
            && environment.lastHeartbeatAt !== null
            && environment.lastHeartbeatAt >= this.predicate.heartbeatCutoff;
    }

    // The order matched candidates should be tried in: the newest matching version first — a loose
    // request ("latest" or a version prefix) prefers the freshest qualifying install, ties keeping the
    // data source's (random) load spread (the sort is stable).
    rank(environments: Array<Environment>): Array<Environment> {
        return [...environments].sort((left, right) => {
            const leftApplication = left.applicationMatching(this.match);
            const rightApplication = right.applicationMatching(this.match);

            if (!leftApplication || !rightApplication) {
                return 0;
            }

            return rightApplication.compareVersion(leftApplication);
        });
    }
}
