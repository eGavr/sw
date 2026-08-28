import { Execution } from "../environment/execution";
import { ProjectId } from "../project/project-id";

import { CloudAccountId } from "./cloud-account-id";
import { Stereotype, StereotypeData } from "./stereotype";

// Cloud/substrate connection settings the adapter needs (folder/zone/subnet/host/cluster, …). Opaque to
// the domain — only the adapter interprets it. Secrets go in credentialRef.
export type CloudConfig = Record<string, unknown>;

export type CloudAccountData = {
    id: string;
    projectId: string;
    type: string;
    config: CloudConfig;
    credentialRef?: string | null;
    provides: ReadonlyArray<StereotypeData>;
    createdAt: Date;
    updatedAt: Date;
};

export type CloudAccountCreateParams = {
    projectId: ProjectId;
    type: string;
    // What (platform, execution) substrates this cloud can run — materialised from the infra catalogue by
    // the use case at connect time; the domain only stores and matches them, it does not know cloud types.
    provides: ReadonlyArray<Stereotype>;
    config?: CloudConfig;
    credentialRef?: string | null;
};

type CloudAccountConstructorParams = {
    id?: CloudAccountId;
    projectId: ProjectId;
    type: string;
    provides: ReadonlyArray<Stereotype>;
    config?: CloudConfig;
    credentialRef?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
};

export class CloudAccount {
    static create(params: CloudAccountCreateParams): CloudAccount {
        return new CloudAccount(params);
    }

    static fromObject(data: CloudAccountData): CloudAccount {
        return new CloudAccount({
            id: CloudAccountId.fromString(data.id),
            projectId: ProjectId.fromString(data.projectId),
            type: data.type,
            config: data.config ?? {},
            credentialRef: data.credentialRef ?? null,
            provides: data.provides.map((stereotype) => Stereotype.fromObject(stereotype)),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        });
    }

    readonly type: string;
    readonly credentialRef: string | null;
    readonly createdAt: Date;

    private readonly _id: CloudAccountId;
    private readonly _projectId: ProjectId;
    private readonly _provides: ReadonlyArray<Stereotype>;
    private _config: CloudConfig;
    private _updatedAt: Date;

    private constructor(params: CloudAccountConstructorParams) {
        this._id = params.id ?? CloudAccountId.create();
        this._projectId = params.projectId;
        this.type = params.type;
        this._provides = params.provides;
        this._config = params.config ?? {};
        this.credentialRef = params.credentialRef ?? null;
        this.createdAt = params.createdAt ?? new Date();
        this._updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    get projectId(): ProjectId {
        return this._projectId;
    }

    // A shallow copy so callers can't mutate the aggregate's internal state through the getter — changes go
    // through updateConfig(). (toObject keeps the raw ref: it is the serialization boundary for persistence.)
    get config(): CloudConfig {
        return { ...this._config };
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    providedStereotypes(): ReadonlyArray<Stereotype> {
        return this._provides;
    }

    // Whether this cloud provisions the requested substrate — the routing key that lets a project hold
    // several clouds (yandex for android/*, docker for linux/container, …).
    supports(platformName: string, execution: Execution): boolean {
        return this._provides.some((stereotype) => stereotype.matches(platformName, execution));
    }

    // Do this cloud's substrates overlap another's? Keeps a project's clouds non-overlapping so each
    // (platform, execution) resolves to exactly one cloud account.
    overlaps(other: CloudAccount): boolean {
        return this._provides.some((stereotype) =>
            other.supports(stereotype.platformName, stereotype.execution),
        );
    }

    updateConfig(config: CloudConfig): void {
        this._config = config;
        this.touch();
    }

    belongsTo(projectId: ProjectId): boolean {
        return this._projectId.getValue() === projectId.getValue();
    }

    toObject(): CloudAccountData {
        return {
            id: this.id,
            projectId: this._projectId.getValue(),
            type: this.type,
            config: this._config,
            credentialRef: this.credentialRef,
            provides: this._provides.map((stereotype) => stereotype.toObject()),
            createdAt: this.createdAt,
            updatedAt: this._updatedAt,
        };
    }

    private touch(): void {
        this._updatedAt = new Date();
    }
}
