import { AccountId } from "../account/account-id";
import { InvalidArgumentError } from "../error/invalid-argument-error";
import { ProviderAccountId } from "../provider-account/provider-account-id";

import { Application, ApplicationData } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentId } from "./environment-id";
import { EnvironmentState } from "./environment-state";
import { EnvironmentStateReason } from "./environment-state-reason";
import { EnvironmentStatus } from "./environment-status";
import { InvalidEnvironmentStateTransitionError } from "./error/invalid-environment-state-transition-error";
import { Platform, PlatformData } from "./platform/platform";

export type EnvironmentData = {
    id: string;
    accountId: string;
    providerAccountId?: string | null;
    state: string;
    stateReason?: string | null;
    platform: PlatformData;
    applications: Array<ApplicationData>;
    endpoint?: string | null;
    busy: boolean;
    lastHeartbeatAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type EnvironmentCreateParams = {
    accountId: AccountId;
    providerAccountId?: ProviderAccountId | null;
    platform: Platform;
    applications: ApplicationList;
};

type EnvironmentConstructorParams = {
    id?: EnvironmentId;
    accountId: AccountId;
    providerAccountId?: ProviderAccountId | null;
    state?: EnvironmentState;
    stateReason?: EnvironmentStateReason | null;
    platform: Platform;
    applications: ApplicationList;
    endpoint?: EnvironmentEndpoint | null;
    busy?: boolean;
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
            accountId: AccountId.fromString(data.accountId),
            providerAccountId: data.providerAccountId ? ProviderAccountId.fromString(data.providerAccountId) : null,
            state: Environment.toState(data.state),
            stateReason: data.stateReason ? Environment.toStateReason(data.stateReason) : null,
            platform: Platform.fromObject(data.platform),
            applications: ApplicationList.fromObject(data.applications),
            endpoint: data.endpoint ? new EnvironmentEndpoint(data.endpoint) : null,
            busy: data.busy,
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
    readonly applications: ApplicationList;
    readonly createdAt: Date;

    private readonly _id: EnvironmentId;
    private readonly _accountId: AccountId;
    private readonly _providerAccountId: ProviderAccountId | null;
    private _state: EnvironmentState;
    private _stateReason: EnvironmentStateReason | null;
    private _endpoint: EnvironmentEndpoint | null;
    private _busy: boolean;
    private _lastHeartbeatAt: Date | null;
    private _updatedAt: Date;

    private constructor(params: EnvironmentConstructorParams) {
        this._id = params.id ?? EnvironmentId.create();
        this._accountId = params.accountId;
        this._providerAccountId = params.providerAccountId ?? null;
        this._state = params.state ?? EnvironmentState.Enqueued;
        this._stateReason = params.stateReason ?? null;
        this.platform = params.platform;
        this.applications = params.applications;
        this._endpoint = params.endpoint ?? null;
        this._busy = params.busy ?? false;
        this._lastHeartbeatAt = params.lastHeartbeatAt ?? null;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get accountId(): AccountId {
        return this._accountId;
    }

    get providerAccountId(): string | null {
        return this._providerAccountId?.getValue() ?? null;
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

    get lastHeartbeatAt(): Date | null {
        return this._lastHeartbeatAt;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    supports(application: Application): boolean {
        return this.applications.has(application);
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

    failProvisioning(reason: EnvironmentStateReason): void {
        this.transitionFromProvisioning(EnvironmentState.Failed);
        this._stateReason = reason;
    }

    retryProvisioning(): void {
        this.transitionFromProvisioning(EnvironmentState.Enqueued);
        this._stateReason = null;
    }

    startDeletion(): void {
        if (this._state === EnvironmentState.Deleting) {
            return;
        }

        this._state = EnvironmentState.Deleting;
        this.touch();
    }

    effectiveStatus(now: Date, freshnessWindowMs: number): EnvironmentStatus {
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
                return this.isFresh(now, freshnessWindowMs) ? EnvironmentStatus.Active : EnvironmentStatus.Unhealthy;
            case EnvironmentState.Deleting:
                return this.isFresh(now, freshnessWindowMs) ? EnvironmentStatus.Deleting : EnvironmentStatus.Deleted;
        }
    }

    toObject(): EnvironmentData {
        return {
            id: this.id,
            accountId: this._accountId.getValue(),
            providerAccountId: this.providerAccountId,
            state: this._state,
            stateReason: this._stateReason,
            platform: this.platform.toObject(),
            applications: this.applications.toArray(),
            endpoint: this.endpoint,
            busy: this._busy,
            lastHeartbeatAt: this._lastHeartbeatAt,
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private isFresh(now: Date, freshnessWindowMs: number): boolean {
        return this._lastHeartbeatAt !== null && now.getTime() - this._lastHeartbeatAt.getTime() <= freshnessWindowMs;
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
