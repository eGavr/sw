import { UserId } from "./user-id";

export type UserData = {
    id: string;
    externalId: string;
    providerType: string;
    createdAt: Date;
    updatedAt: Date;
}

type CreateUserParams = {
    externalId: string;
    providerType: string;
}

type UserConstructorParams = {
    id?: string;
    externalId: string;
    providerType: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export class User {
    static fromObject(data: UserData): User {
        return new User(data);
    }

    static create(params: CreateUserParams): User {
        return new User(params)
    }

    readonly externalId: string;
    readonly providerType: string;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    private readonly _id: UserId;

    private constructor(params: UserConstructorParams) {
        this._id = params.id ? UserId.fromString(params.id) : UserId.create();
        this.externalId = params.externalId;
        this.providerType = params.providerType;
        this.createdAt = params.createdAt ?? new Date();
        this.updatedAt = params.updatedAt ?? this.createdAt;
    }

    get id(): string {
        return this._id.getValue();
    }

    toObject(): UserData {
        return {
            id: this.id,
            externalId: this.externalId,
            providerType: this.providerType,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        }
    }
}
