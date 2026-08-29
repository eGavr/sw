import { ResourceId } from "../../types/resource-id/resource-id";
import { CloudAccountId } from "../cloud-account/cloud-account-id";
import { InvalidArgumentError } from "../error/invalid-argument-error";
import { ProjectId } from "../project/project-id";

import { Application, ApplicationData } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentId } from "./environment-id";
import { EnvironmentState } from "./environment-state";
import { EnvironmentStateReason } from "./environment-state-reason";
import { EnvironmentStatus } from "./environment-status";
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
    state: string;
    stateReason?: string | null;
    platform: PlatformData;
    execution?: string;
    applications: Array<ApplicationData>;
    endpoint?: string | null;
    busy: boolean;
    attempts?: number;
    lastHeartbeatAt?: Date | null;
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
    state?: EnvironmentState;
    stateReason?: EnvironmentStateReason | null;
    platform: Platform;
    execution?: Execution;
    applications: ApplicationList;
    endpoint?: EnvironmentEndpoint | null;
    busy?: boolean;
    attempts?: number;
    lastHeartbeatAt?: Date | null;
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
            state: Environment.toState(data.state),
            stateReason: data.stateReason ? Environment.toStateReason(data.stateReason) : null,
            platform: Platform.fromObject(data.platform),
            execution: data.execution ? toExecution(data.execution) : defaultExecution,
            applications: ApplicationList.fromObject(data.applications),
            endpoint: data.endpoint ? new EnvironmentEndpoint(data.endpoint) : null,
            busy: data.busy,
            attempts: data.attempts ?? 0,
            lastHeartbeatAt: data.lastHeartbeatAt ?? null,
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

    readonly platform: Platform;
    readonly execution: Execution;
    readonly applications: ApplicationList;
    readonly createdAt: Date;

    private readonly _id: EnvironmentId;
    private readonly _resourceId: ResourceId | null;
    private readonly _projectId: ProjectId;
    private readonly _cloudAccountId: CloudAccountId | null;
    private readonly _cloudType: string | null;
    private _state: EnvironmentState;
    private _stateReason: EnvironmentStateReason | null;
    private _endpoint: EnvironmentEndpoint | null;
    private _busy: boolean;
    private readonly _attempts: number;
    private _lastHeartbeatAt: Date | null;
    private _updatedAt: Date;

    private constructor(params: EnvironmentConstructorParams) {
        this._id = params.id ?? EnvironmentId.create();
        this._resourceId = params.resourceId ? new ResourceId(params.resourceId) : null;
        this._projectId = params.projectId;
        this._cloudAccountId = params.cloudAccountId ?? null;
        this._cloudType = params.cloudType ?? null;
        this._state = params.state ?? EnvironmentState.Enqueued;
        this._stateReason = params.stateReason ?? null;
        this.platform = params.platform;
        this.execution = params.execution ?? defaultExecution;
        this.applications = params.applications;
        this._endpoint = params.endpoint ?? null;
        this._busy = params.busy ?? false;
        this._attempts = params.attempts ?? 0;
        this._lastHeartbeatAt = params.lastHeartbeatAt ?? null;
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

    get state(): EnvironmentState {
        return this._state;
    }

    get stateReason(): EnvironmentStateReason | null {
        return this._stateReason;
    }

    get endpoint(): string | null {
        return this._endpoint?.getValue() ?? null;
    }

    get busy(): boolean {
        return this._busy;
    }

    get attempts(): number {
        return this._attempts;
    }

    get lastHeartbeatAt(): Date | null {
        return this._lastHeartbeatAt;
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

    heartbeat(busy: boolean, now: Date): void {
        if (this._state !== EnvironmentState.Executing) {
            throw new InvalidEnvironmentStateTransitionError(this._state, EnvironmentState.Executing);
        }

        this._busy = busy;
        this._lastHeartbeatAt = now;
        this.touch();
    }

    // Optimistic occupancy right after a session lands on this environment's node: the busy hint flips
    // immediately instead of waiting for the next agent heartbeat. Liveness is untouched — the heartbeat
    // timestamp stays the agent's word, and the next heartbeat overwrites busy either way (self-healing).
    occupy(): void {
        if (this._state !== EnvironmentState.Executing) {
            throw new InvalidEnvironmentStateTransitionError(this._state, EnvironmentState.Executing);
        }

        this._busy = true;
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

    // Busy is the agent's word, and it only counts while the agent is provably alive: once the
    // heartbeat goes stale the environment is not "busy" — it is unhealthy (see effectiveStatus).
    isBusy(): boolean {
        return this._busy && this.hasFreshHeartbeat();
    }

    toObject(): EnvironmentData {
        return {
            id: this.id,
            resourceId: this.resourceId,
            projectId: this._projectId.getValue(),
            cloudAccountId: this.cloudAccountId,
            cloudType: this._cloudType,
            state: this._state,
            stateReason: this._stateReason,
            platform: this.platform.toObject(),
            execution: this.execution,
            applications: this.applications.toArray(),
            endpoint: this.endpoint,
            busy: this._busy,
            attempts: this._attempts,
            lastHeartbeatAt: this._lastHeartbeatAt,
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
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
