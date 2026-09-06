import { ResourceId } from "../../types/resource-id/resource-id";
import { CloudAccountId } from "../cloud-account/cloud-account-id";
import { InvalidArgumentError } from "../error/invalid-argument-error";
import { ProjectId } from "../project/project-id";

import { Application, ApplicationData } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { ApplicationMatch } from "./application/application-match";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentId } from "./environment-id";
import { EnvironmentOccupancy, toEnvironmentOccupancy } from "./environment-occupancy";
import { EnvironmentState } from "./environment-state";
import { EnvironmentStateReason } from "./environment-state-reason";
import { EnvironmentStatus } from "./environment-status";
import {
    InvalidEnvironmentOccupancyTransitionError,
} from "./error/invalid-environment-occupancy-transition-error";
import { InvalidEnvironmentStateTransitionError } from "./error/invalid-environment-state-transition-error";
import { defaultExecution, Execution, toExecution } from "./execution";
import { defaultHeartbeatFreshnessMs } from "./heartbeat-freshness";
import { Platform, PlatformData } from "./platform/platform";

export type EnvironmentData = {
    id: string;
    resourceId?: string | null;
    projectId: string;
    cloudAccountId?: string | null;
    cloudType?: string | null;
    computeKind?: string | null;
    state: string;
    stateReason?: string | null;
    platform: PlatformData;
    execution?: string;
    applications: Array<ApplicationData>;
    endpoint?: string | null;
    occupancy: string;
    attempts?: number;
    lastHeartbeatAt?: Date | null;
    occupancyLastConfirmedAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type EnvironmentCreateParams = {
    resourceId?: string;
    projectId: ProjectId;
    // Which cloud this environment runs on, plus its type denormalised for routing (adapter = (cloudType,
    // execution)) without loading the cloud account.
    cloudAccountId?: CloudAccountId | null;
    cloudType?: string | null;
    computeKind?: string | null;
    platform: Platform;
    execution?: Execution;
    applications: ApplicationList;
};

type EnvironmentConstructorParams = {
    id?: EnvironmentId;
    resourceId?: string | null;
    projectId: ProjectId;
    cloudAccountId?: CloudAccountId | null;
    cloudType?: string | null;
    computeKind?: string | null;
    state?: EnvironmentState;
    stateReason?: EnvironmentStateReason | null;
    platform: Platform;
    execution?: Execution;
    applications: ApplicationList;
    endpoint?: EnvironmentEndpoint | null;
    occupancy?: EnvironmentOccupancy;
    attempts?: number;
    lastHeartbeatAt?: Date | null;
    occupancyLastConfirmedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
};

export class Environment {
    static create(params: EnvironmentCreateParams): Environment {
        return new Environment({ ...params, state: EnvironmentState.Enqueued });
    }

    static fromObject(data: EnvironmentData): Environment {
        return new Environment({
            id: EnvironmentId.fromString(data.id),
            resourceId: data.resourceId,
            projectId: ProjectId.fromString(data.projectId),
            cloudAccountId: data.cloudAccountId ? CloudAccountId.fromString(data.cloudAccountId) : null,
            cloudType: data.cloudType ?? null,
            computeKind: data.computeKind ?? null,
            state: Environment.toState(data.state),
            stateReason: data.stateReason ? Environment.toStateReason(data.stateReason) : null,
            platform: Platform.fromObject(data.platform),
            execution: data.execution ? toExecution(data.execution) : defaultExecution,
            applications: ApplicationList.fromObject(data.applications),
            endpoint: data.endpoint ? new EnvironmentEndpoint(data.endpoint) : null,
            occupancy: Environment.toOccupancy(data.occupancy),
            attempts: data.attempts ?? 0,
            lastHeartbeatAt: data.lastHeartbeatAt ?? null,
            occupancyLastConfirmedAt: data.occupancyLastConfirmedAt ?? null,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    private static toState(value: string): EnvironmentState {
        const state = Object.values(EnvironmentState).find((candidate) => candidate === value);

        if (!state) {
            throw new InvalidArgumentError(`environment state: ${value}: unknown`);
        }

        return state;
    }

    private static toStateReason(value: string): EnvironmentStateReason {
        const reason = Object.values(EnvironmentStateReason).find((candidate) => candidate === value);

        if (!reason) {
            throw new InvalidArgumentError(`environment state reason: ${value}: unknown`);
        }

        return reason;
    }

    private static toOccupancy(value: string): EnvironmentOccupancy {
        const occupancy = toEnvironmentOccupancy(value);

        if (!occupancy) {
            throw new InvalidArgumentError(`environment occupancy: ${value}: unknown`);
        }

        return occupancy;
    }

    readonly platform: Platform;
    readonly execution: Execution;
    readonly applications: ApplicationList;
    readonly createdAt: Date;

    private readonly _id: EnvironmentId;
    private readonly _resourceId: ResourceId | null;
    private readonly _projectId: ProjectId;
    private readonly _cloudAccountId: CloudAccountId | null;
    private readonly _cloudType: string | null;
    private readonly _computeKind: string | null;
    private _state: EnvironmentState;
    private _stateReason: EnvironmentStateReason | null;
    private _endpoint: EnvironmentEndpoint | null;
    private _occupancy: EnvironmentOccupancy;
    private readonly _attempts: number;
    private _lastHeartbeatAt: Date | null;
    private _occupancyLastConfirmedAt: Date | null;
    private _updatedAt: Date;

    private constructor(params: EnvironmentConstructorParams) {
        this._id = params.id ?? EnvironmentId.create();
        this._resourceId = params.resourceId ? new ResourceId(params.resourceId) : null;
        this._projectId = params.projectId;
        this._cloudAccountId = params.cloudAccountId ?? null;
        this._cloudType = params.cloudType ?? null;
        this._computeKind = params.computeKind ?? null;
        this._state = params.state ?? EnvironmentState.Enqueued;
        this._stateReason = params.stateReason ?? null;
        this.platform = params.platform;
        this.execution = params.execution ?? defaultExecution;
        this.applications = params.applications;
        this._endpoint = params.endpoint ?? null;
        this._occupancy = params.occupancy ?? EnvironmentOccupancy.Free;
        this._attempts = params.attempts ?? 0;
        this._lastHeartbeatAt = params.lastHeartbeatAt ?? null;
        this._occupancyLastConfirmedAt = params.occupancyLastConfirmedAt ?? null;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    // The human-readable id if one was chosen at creation, else null (then the uid addresses the resource).
    get resourceId(): string | null {
        return this._resourceId ? this._resourceId.getValue() : null;
    }

    get projectId(): ProjectId {
        return this._projectId;
    }

    get cloudAccountId(): string | null {
        return this._cloudAccountId?.getValue() ?? null;
    }

    // The cloud type this runs on, denormalised for routing (adapter = (cloudType, execution)).
    get cloudType(): string | null {
        return this._cloudType;
    }

    // The compute kind serving this environment (the binding's kind at creation) — the routing key's last
    // segment. A later rebind of the substrate does not touch it: this records what THIS environment runs
    // on. Internal routing state, deliberately not on the wire.
    get computeKind(): string | null {
        return this._computeKind;
    }

    get state(): EnvironmentState {
        return this._state;
    }

    get stateReason(): EnvironmentStateReason | null {
        return this._stateReason;
    }

    get endpoint(): string | null {
        return this._endpoint?.getValue() ?? null;
    }

    get occupancy(): EnvironmentOccupancy {
        return this._occupancy;
    }

    get attempts(): number {
        return this._attempts;
    }

    get lastHeartbeatAt(): Date | null {
        return this._lastHeartbeatAt;
    }

    get occupancyLastConfirmedAt(): Date | null {
        return this._occupancyLastConfirmedAt;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    supports(application: Application): boolean {
        return this.applications.has(application);
    }

    // The installed application offering the given name, if any — the concrete version a session opened
    // here will run, and what "latest" ranks environments by.
    applicationFor(name: string): Application | null {
        return this.applications.find(name);
    }

    // The installed application a session request expands to on this environment (alias-aware names,
    // version-prefix loose), newest first when several qualify.
    applicationMatching(match: ApplicationMatch): Application | null {
        return this.applications.bestMatch(match);
    }

    // Whether the compute backend should be running a container for this environment right now.
    // The compute data source only reconciles to this flag; it does not decide it.
    shouldBeRunning(): boolean {
        return this._state === EnvironmentState.Starting
            || this._state === EnvironmentState.Preparing
            || this._state === EnvironmentState.Executing;
    }

    claim(): void {
        this.transition(EnvironmentState.Enqueued, EnvironmentState.Starting);
    }

    markDispatched(): void {
        this.transition(EnvironmentState.Starting, EnvironmentState.Preparing);
    }

    register(endpoint: EnvironmentEndpoint, now: Date): void {
        this.transition(EnvironmentState.Preparing, EnvironmentState.Executing);
        this._endpoint = endpoint;
        this._lastHeartbeatAt = now;
    }

    // Every heartbeat refreshes the agent's liveness word and reports whether a session is running.
    // Occupancy merges rather than copies: `reserved` belongs to the wd that is still creating the
    // session, and the agent cannot know about it yet — so "no session" keeps the reservation AND does
    // not confirm it (that silence is how a dead reserver's hold goes stale), while "session running"
    // always wins (the agent saw it land, the reservation fulfilled its purpose).
    heartbeat(busy: boolean, now: Date): void {
        if (this._state !== EnvironmentState.Executing) {
            throw new InvalidEnvironmentStateTransitionError(this._state, EnvironmentState.Executing);
        }

        if (busy || this._occupancy !== EnvironmentOccupancy.Reserved) {
            this.confirmOccupancy(busy ? EnvironmentOccupancy.Busy : EnvironmentOccupancy.Free, now);
        }

        this._lastHeartbeatAt = now;
        this.touch();
    }

    // Pessimistic allocation, step 1: take the environment for one upcoming session create. Only a
    // live free executing environment can be reserved; run under the storage row lock (`with`), the
    // failed guard IS the lost race — the caller moves on to the next candidate.
    reserve(now: Date): void {
        if (this._state !== EnvironmentState.Executing || this._occupancy !== EnvironmentOccupancy.Free
            || !this.hasFreshHeartbeat()) {
            throw new InvalidEnvironmentOccupancyTransitionError(this._occupancy, EnvironmentOccupancy.Reserved);
        }

        this.confirmOccupancy(EnvironmentOccupancy.Reserved, now);
        this.touch();
    }

    // The reserving wd keeps vouching for its hold while it waits for the node — re-confirmed every few
    // seconds so the sweep can tell a slow create (android takes tens of seconds) from a dead reserver.
    confirmReservation(now: Date): void {
        if (this._occupancy !== EnvironmentOccupancy.Reserved) {
            throw new InvalidEnvironmentOccupancyTransitionError(this._occupancy, EnvironmentOccupancy.Reserved);
        }

        this.confirmOccupancy(EnvironmentOccupancy.Reserved, now);
        this.touch();
    }

    // Pessimistic allocation, success: the session landed on the node — the reservation becomes real
    // occupancy. Idempotent for an already-busy environment: the agent's heartbeat may report the new
    // session before the reserving wd gets here, and both words mean the same success. Only occupying
    // out of thin air (free, no reservation) breaks the protocol.
    occupy(): void {
        if (this._occupancy === EnvironmentOccupancy.Free) {
            throw new InvalidEnvironmentOccupancyTransitionError(this._occupancy, EnvironmentOccupancy.Busy);
        }

        this.confirmOccupancy(EnvironmentOccupancy.Busy, new Date());
        this.touch();
    }

    // Pessimistic allocation, failure (or the sweep reclaiming a dead reserver's hold): the environment
    // returns to the pool. Idempotent for an already-free environment — release can race the sweep, and
    // both mean the same thing. A busy environment is not releasable: the session is real.
    releaseReservation(): void {
        if (this._occupancy === EnvironmentOccupancy.Busy) {
            throw new InvalidEnvironmentOccupancyTransitionError(this._occupancy, EnvironmentOccupancy.Free);
        }

        this.confirmOccupancy(EnvironmentOccupancy.Free, new Date());
        this.touch();
    }

    failProvisioning(reason: EnvironmentStateReason): void {
        this.transitionFromProvisioning(EnvironmentState.Failed);
        this._stateReason = reason;
    }

    retryProvisioning(): void {
        this.transitionFromProvisioning(EnvironmentState.Enqueued);
        this._stateReason = null;
    }

    // Reaper path: a provisioning environment (starting/preparing) whose lease timed out. Within the
    // retry budget it goes back to the queue for another attempt; once the budget is spent it fails
    // permanently. The attempt counter itself is bumped by the atomic claim, not here.
    reclaimStuck(maxAttempts: number): void {
        if (this._attempts >= maxAttempts) {
            this.failProvisioning(EnvironmentStateReason.ProvisioningTimeout);

            return;
        }

        this.retryProvisioning();
    }

    // Reaper path: an `executing` environment whose heartbeat lapsed — its container/agent died. It is
    // torn down rather than silently re-created (resources are user-created and guaranteed), so it moves
    // to `deleting`, where the worker deprovisions the container and GC then removes the row.
    reclaimCrashed(): void {
        this.transition(EnvironmentState.Executing, EnvironmentState.Deleting);
    }

    startDeletion(): void {
        if (this._state === EnvironmentState.Deleting) {
            return;
        }

        this._state = EnvironmentState.Deleting;
        this.touch();
    }

    // The externally observable status, derived from the lifecycle state and heartbeat liveness — the
    // entity owns the whole rule (clock and freshness window included), callers just ask.
    effectiveStatus(): EnvironmentStatus {
        switch (this._state) {
            case EnvironmentState.Enqueued:
                return EnvironmentStatus.Enqueued;
            case EnvironmentState.Starting:
                return EnvironmentStatus.Preparing;
            case EnvironmentState.Preparing:
                return EnvironmentStatus.Preparing;
            case EnvironmentState.Failed:
                return EnvironmentStatus.Failed;
            case EnvironmentState.Executing:
                return this.hasFreshHeartbeat() ? EnvironmentStatus.Active : EnvironmentStatus.Unhealthy;
            case EnvironmentState.Deleting:
                return this.hasFreshHeartbeat() ? EnvironmentStatus.Deleting : EnvironmentStatus.Deleted;
        }
    }

    // The externally observable occupancy. Busy is the agent's word and only counts while the agent is
    // provably alive (a stale-heartbeat environment is unhealthy, not busy). Reserved is reported as
    // stored: it is transient by construction — the sweep frees a dead reserver's hold within seconds,
    // and until then the environment is genuinely not takeable, so "reserved" stays the honest answer.
    effectiveOccupancy(): EnvironmentOccupancy {
        if (this._occupancy === EnvironmentOccupancy.Busy && !this.hasFreshHeartbeat()) {
            return EnvironmentOccupancy.Free;
        }

        return this._occupancy;
    }

    isBusy(): boolean {
        return this.effectiveOccupancy() === EnvironmentOccupancy.Busy;
    }

    toObject(): EnvironmentData {
        return {
            id: this.id,
            resourceId: this.resourceId,
            projectId: this._projectId.getValue(),
            cloudAccountId: this.cloudAccountId,
            cloudType: this._cloudType,
            computeKind: this._computeKind,
            state: this._state,
            stateReason: this._stateReason,
            platform: this.platform.toObject(),
            execution: this.execution,
            applications: this.applications.toArray(),
            endpoint: this.endpoint,
            occupancy: this._occupancy,
            attempts: this._attempts,
            lastHeartbeatAt: this._lastHeartbeatAt,
            occupancyLastConfirmedAt: this._occupancyLastConfirmedAt,
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    // Occupancy and its confirmation move together: setting the word IS vouching for it.
    private confirmOccupancy(occupancy: EnvironmentOccupancy, now: Date): void {
        this._occupancy = occupancy;
        this._occupancyLastConfirmedAt = now;
    }

    private hasFreshHeartbeat(): boolean {
        return this._lastHeartbeatAt !== null
            && Date.now() - this._lastHeartbeatAt.getTime() <= defaultHeartbeatFreshnessMs;
    }

    private transition(from: EnvironmentState, to: EnvironmentState): void {
        if (this._state !== from) {
            throw new InvalidEnvironmentStateTransitionError(this._state, to);
        }

        this._state = to;
        this.touch();
    }

    private transitionFromProvisioning(to: EnvironmentState): void {
        if (this._state !== EnvironmentState.Starting && this._state !== EnvironmentState.Preparing) {
            throw new InvalidEnvironmentStateTransitionError(this._state, to);
        }

        this._state = to;
        this.touch();
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
