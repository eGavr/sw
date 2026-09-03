import { ProjectId } from "../project/project-id";

import { NetBridgeCredentialId } from "./net-bridge-credential-id";
import { NetBridgeSecret } from "./net-bridge-secret";

export type NetBridgeCredentialData = {
    id: string;
    projectId: string;
    name: string | null;
    secretHash: string;
    createdAt: Date;
    expiresAt: Date | null;
    lastUsedAt: Date | null;
};

export type NetBridgeCredentialCreateParams = {
    projectId: ProjectId;
    secret: NetBridgeSecret;
    name?: string | null;
    expiresAt?: Date | null;
};

// The freshly minted credential together with its plaintext secret — the secret is returned to the caller
// exactly once (they store it, e.g. in a CI secret), and only its fingerprint is persisted.
export type IssuedNetBridgeCredential = {
    credential: NetBridgeCredential;
    secret: NetBridgeSecret;
};

type NetBridgeCredentialConstructorParams = {
    id?: NetBridgeCredentialId;
    projectId: ProjectId;
    name?: string | null;
    secretHash: string;
    createdAt?: Date;
    expiresAt?: Date | null;
    lastUsedAt?: Date | null;
};

// A long-lived, project-scoped access key that lets a NetBridge tunnel client attach to the project.
// Revocable (delete the credential) and optionally time-boxed. Only the secret's fingerprint is held —
// never the secret itself.
export class NetBridgeCredential {
    static create(params: NetBridgeCredentialCreateParams): NetBridgeCredential {
        return new NetBridgeCredential({
            projectId: params.projectId,
            name: params.name ?? null,
            secretHash: params.secret.fingerprint(),
            expiresAt: params.expiresAt ?? null,
        });
    }

    static fromObject(data: NetBridgeCredentialData): NetBridgeCredential {
        return new NetBridgeCredential({
            id: NetBridgeCredentialId.fromString(data.id),
            projectId: ProjectId.fromString(data.projectId),
            name: data.name,
            secretHash: data.secretHash,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            lastUsedAt: data.lastUsedAt,
        });
    }

    readonly name: string | null;
    readonly createdAt: Date;
    readonly expiresAt: Date | null;
    readonly lastUsedAt: Date | null;

    private readonly _id: NetBridgeCredentialId;
    private readonly _projectId: ProjectId;
    private readonly _secretHash: string;

    private constructor(params: NetBridgeCredentialConstructorParams) {
        this._id = params.id ?? NetBridgeCredentialId.create();
        this._projectId = params.projectId;
        this.name = params.name ?? null;
        this._secretHash = params.secretHash;
        this.createdAt = params.createdAt ?? new Date();
        this.expiresAt = params.expiresAt ?? null;
        this.lastUsedAt = params.lastUsedAt ?? null;
    }

    get id(): string {
        return this._id.getValue();
    }

    get projectId(): ProjectId {
        return this._projectId;
    }

    belongsTo(projectId: ProjectId): boolean {
        return this._projectId.getValue() === projectId.getValue();
    }

    toObject(): NetBridgeCredentialData {
        return {
            id: this.id,
            projectId: this._projectId.getValue(),
            name: this.name,
            secretHash: this._secretHash,
            createdAt: this.createdAt,
            expiresAt: this.expiresAt,
            lastUsedAt: this.lastUsedAt,
        };
    }
}
