import { UserId } from "./user-id";

export type UserData = {
    externalId: string;
}

type CreateUserParams = {
    externalId: string;
}

type UserConstructorParams = {
    id?: string;
    externalId: string;
}

export class User {
    static fromObject(data: UserData): User {
        return new User(data);
    }

    static create(params: CreateUserParams): User {
        return new User(params)
    }

    public readonly externalId: string;

    private readonly _id: UserId;

    private constructor(params: UserConstructorParams) {
        this._id = params.id ? UserId.fromString(params.id) : UserId.create();
        this.externalId = params.externalId;
    }

    get id(): string {
        return this._id.getValue();
    }
}
