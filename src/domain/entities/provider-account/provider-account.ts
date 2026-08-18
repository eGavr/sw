import { Execution, toExecution } from "../environment/execution";
import { InvalidArgumentError } from "../error/invalid-argument-error";
import { ProjectId } from "../project/project-id";

import { ProviderAccountId } from "./provider-account-id";
import { ProviderAccountState } from "./provider-account-state";

// Provider-specific, non-secret settings the adapter needs to provision (which cluster/folder/host,
// image, sizing, …). Opaque to the domain — only the adapter interprets it. Secrets go in credentialRef.
export type ProviderConfig = Record<string, unknown>;

export type ProviderAccountData = {
    id: string;
    projectId: string;
    provider: string;
    platformName: string;
    execution: string;
    config: ProviderConfig;
    credentialRef?: string | null;
    state: string;
    createdAt: Date;
    updatedAt: Date;
};

export type ProviderAccountCreateParams = {
    projectId: ProjectId;
    provider: string;
    platformName: string;
    execution: Execution;
    config?: ProviderConfig;
    credentialRef?: string | null;
};

type ProviderAccountConstructorParams = {
    id?: ProviderAccountId;
    projectId: ProjectId;
    provider: string;
    platformName: string;
    execution: Execution;
    config?: ProviderConfig;
    credentialRef?: string | null;
    state?: ProviderAccountState;
    createdAt?: Date;
    updatedAt?: Date;
};

export class ProviderAccount {
    static create(params: ProviderAccountCreateParams): ProviderAccount {
        return new ProviderAccount({ ...params, state: ProviderAccountState.Active });
    }

    static fromObject(data: ProviderAccountData): ProviderAccount {
        return new ProviderAccount({
            id: ProviderAccountId.fromString(data.id),
            projectId: ProjectId.fromString(data.projectId),
            provider: data.provider,
            platformName: data.platformName,
            execution: toExecution(data.execution),
            config: data.config ?? {},
            credentialRef: data.credentialRef ?? null,
            state: ProviderAccount.toState(data.state),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    private static toState(value: string): ProviderAccountState {
        const state = Object.values(ProviderAccountState).find((candidate) => candidate === value);

        if (!state) {
            throw new InvalidArgumentError(`provider account state: ${value}: unknown`);
        }

        return state;
    }

    readonly provider: string;
    readonly platformName: string;
    readonly execution: Execution;
    readonly config: ProviderConfig;
    readonly credentialRef: string | null;
    readonly createdAt: Date;

    private readonly _id: ProviderAccountId;
    private readonly _projectId: ProjectId;
    private _state: ProviderAccountState;
    private _updatedAt: Date;

    private constructor(params: ProviderAccountConstructorParams) {
        this._id = params.id ?? ProviderAccountId.create();
        this._projectId = params.projectId;
        this.provider = params.provider;
        this.platformName = params.platformName;
        this.execution = params.execution;
        this.config = params.config ?? {};
        this.credentialRef = params.credentialRef ?? null;
        this._state = params.state ?? ProviderAccountState.Active;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get projectId(): ProjectId {
        return this._projectId;
    }

    get state(): ProviderAccountState {
        return this._state;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    isActive(): boolean {
        return this._state === ProviderAccountState.Active;
    }

    // Whether this connection provisions the requested substrate — the routing key that lets one project
    // hold several providers (redroid for android/container, kubernetes for linux/container, …).
    serves(platformName: string, execution: Execution): boolean {
        return this.platformName === platformName && this.execution === execution;
    }

    markInvalid(): void {
        this._state = ProviderAccountState.Invalid;
        this.touch();
    }

    markActive(): void {
        this._state = ProviderAccountState.Active;
        this.touch();
    }

    toObject(): ProviderAccountData {
        return {
            id: this.id,
            projectId: this._projectId.getValue(),
            provider: this.provider,
            platformName: this.platformName,
            execution: this.execution,
            config: this.config,
            credentialRef: this.credentialRef,
            state: this._state,
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
