import { EnvironmentId } from "../environment/environment-id";

export type SessionOwnershipData = {
    environmentId: string;
    createdBy: string;
    createdAt: Date;
};

export type SessionOwnershipCreateParams = {
    environmentId: EnvironmentId;
    createdBy: string;
};

// Who created the CURRENT session of an environment — one row per environment, no secrets (the session
// id itself lives only on the node). Exists solely so the creator, and nobody else, may recover the
// live session id on demand. The row follows the session's life: replaced by the next create, dropped
// when the agent reports the environment free, gone with the environment.
export class SessionOwnership {
    static create(params: SessionOwnershipCreateParams): SessionOwnership {
        return new SessionOwnership(params.environmentId, params.createdBy, new Date());
    }

    static fromObject(data: SessionOwnershipData): SessionOwnership {
        return new SessionOwnership(EnvironmentId.fromString(data.environmentId), data.createdBy, data.createdAt);
    }

    private constructor(
        private readonly _environmentId: EnvironmentId,
        readonly createdBy: string,
        readonly createdAt: Date,
    ) {}

    get environmentId(): string {
        return this._environmentId.getValue();
    }

    // The recovery rule: only the session's creator may get the live id back.
    isOwnedBy(externalId: string): boolean {
        return this.createdBy === externalId;
    }

    toObject(): SessionOwnershipData {
        return {
            environmentId: this.environmentId,
            createdBy: this.createdBy,
            createdAt: this.createdAt,
        };
    }
}
