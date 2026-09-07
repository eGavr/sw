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
import { PlatformName } from "./platform/platform-name";
import { RequestedPlatform } from "./platform/requested-platform";

export type AllocatableEnvironmentPredicate = {
    readonly state: EnvironmentState;
    readonly occupancy: EnvironmentOccupancy;
    readonly heartbeatCutoff: Date;
    readonly execution: Execution;
    // The platform parts the request constrains; each null when not asked (any).
    readonly platformNames: ReadonlyArray<PlatformName> | null;
    readonly platformVersionAsk: string | null;
    readonly deviceModel: string | null;
    readonly applicationNames: ReadonlyArray<string>;
    readonly applicationVersionAsk: string | null;
};

export type SessionAllocationParams = {
    readonly now: Date;
    readonly freshnessMs: number;
    readonly execution: Execution;
    readonly platform: RequestedPlatform;
    readonly application: RequestedApplication;
    readonly match: ApplicationMatch;
};

export type OfferedApplicationPredicate = {
    readonly states: ReadonlyArray<EnvironmentState>;
    readonly execution: Execution;
    readonly platformNames: ReadonlyArray<PlatformName> | null;
    readonly platformVersionAsk: string | null;
    readonly deviceModel: string | null;
    readonly applicationNames: ReadonlyArray<string>;
    readonly applicationVersionAsk: string | null;
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
// on the requested execution substrate and platform stereotype (whichever parts were asked — a catalog
// word like `chrome` lives on several platforms), and offering the requested application. What "free" and "fresh" mean is
// a domain decision expressed here as a ready predicate; the data source only translates it into a
// query. The request arrives expanded into an ApplicationMatch: candidate names (alias-aware) and a
// version segment prefix, null meaning "latest" — match by name and let `rank` order by newest.
export class SessionAllocationCriteria {
    static from(params: SessionAllocationParams): SessionAllocationCriteria {
        return new SessionAllocationCriteria(params.application, params.match, params.platform, {
            state: EnvironmentState.Executing,
            occupancy: EnvironmentOccupancy.Free,
            heartbeatCutoff: new Date(params.now.getTime() - params.freshnessMs),
            execution: params.execution,
            platformNames: params.platform.names,
            platformVersionAsk: params.platform.versionAsk,
            deviceModel: params.platform.deviceModel,
            applicationNames: params.match.names,
            applicationVersionAsk: params.match.versionAsk,
        });
    }

    private constructor(
        private readonly application: RequestedApplication,
        private readonly match: ApplicationMatch,
        private readonly platform: RequestedPlatform,
        private readonly predicate: AllocatableEnvironmentPredicate,
    ) {}

    toPredicate(): AllocatableEnvironmentPredicate {
        return this.predicate;
    }

    // The relaxed "could this pool ever serve the request" predicate: same application, platform and
    // substrate, but any state that still leads to executing and no free/fresh demand.
    toOfferPredicate(): OfferedApplicationPredicate {
        return {
            states: statesEventuallyServing,
            execution: this.predicate.execution,
            platformNames: this.predicate.platformNames,
            platformVersionAsk: this.predicate.platformVersionAsk,
            deviceModel: this.predicate.deviceModel,
            applicationNames: this.predicate.applicationNames,
            applicationVersionAsk: this.predicate.applicationVersionAsk,
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
            this.requestedStereotype(),
        );
    }

    // The pool provably offers the request but nothing is takable right now (busy, or every listed
    // candidate was reserved in the race) — a retryable conflict.
    refuseTransientShortage(): never {
        throw new NoAllocatableEnvironmentError(this.application.name, this.requestedVersion());
    }

    // The same rule as the pool predicate, enforced against one targeted environment. Refusal splits
    // honestly: a target that can never serve the request (wrong application/version/platform/substrate)
    // is an invalid request; one that merely cannot right now (provisioning/busy/stale) is a transient
    // conflict.
    admit(environment: Environment): void {
        if (!this.offersRequested(environment)) {
            throw new IncompatibleSessionTargetError(
                environment.id,
                this.application.name,
                this.requestedVersion(),
                this.requestedStereotype(),
            );
        }

        if (!this.isReady(environment)) {
            throw new TargetEnvironmentNotReadyError(environment.id);
        }
    }

    private requestedVersion(): string {
        return this.application.version() ?? latestApplicationVersion;
    }

    // Where the session was asked to run, as the caller phrased it: the platform parts that were asked,
    // and the execution substrate.
    private requestedStereotype(): string {
        const platform = this.platform.describe();

        return platform ? `${platform} ${this.predicate.execution}` : this.predicate.execution;
    }

    private offersRequested(environment: Environment): boolean {
        return environment.execution === this.predicate.execution
            && this.platform.matches(environment.platform)
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
