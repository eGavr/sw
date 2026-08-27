import { UserId } from "./user-id";

export type UserData = {
    id: string;
    externalId: string;
    providerType: string;
    createdAt: Date;
    updatedAt: Date;
    // The groups the identity provider asserts for this identity. Transient (from the token/IdP each
    // request), not persisted, so a role granted to `group:<id>` resolves without our own directory.
    groups?: ReadonlyArray<string>;
}

type UserCreateParams = {
    externalId: string;
    providerType: string;
    groups?: ReadonlyArray<string>;
}

type UserConstructorParams = {
    id?: string;
    externalId: string;
    providerType: string;
    createdAt?: Date;
    updatedAt?: Date;
    groups?: ReadonlyArray<string>;
}

export class User {
    static fromObject(data: UserData): User {
        return new User(data);
    }

    static create(params: UserCreateParams): User {
        return new User(params)
    }

    readonly externalId: string;
    readonly providerType: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly groups: ReadonlyArray<string>;

    private readonly _id: UserId;

    private constructor(params: UserConstructorParams) {
        this._id = params.id ? UserId.fromString(params.id) : UserId.create();
        this.externalId = params.externalId;
        this.providerType = params.providerType;
        this.createdAt = params.createdAt ?? new Date();
        this.updatedAt = params.updatedAt ?? this.createdAt;
        this.groups = params.groups ?? [];
    }

    get id(): string {
        return this._id.getValue();
    }
}
