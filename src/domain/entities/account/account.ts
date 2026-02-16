import { User, UserData } from "../user/user";

import { AccountId } from "./account-id";
import { AccountName } from "./account-name";

export type AccountData = {
    id: string;
    name: string;
    createdBy: UserData;
}

export type CreateAccountParams = {
    name: string;
    createdBy: User;
};

export type AccountConstructorParams = {
    id?: string;
    name: string;
    createdBy: User;
}

export class Account {
    static fromObject(data: AccountData): Account {
        const { createdBy, ...params } = data;

        return new Account({ ...params, createdBy: User.fromObject(createdBy) });
    }

    static create(params: CreateAccountParams): Account {
        return new Account(params);
    }

    readonly createdBy: User;

    private readonly _id: AccountId;
    private readonly _name: AccountName;

    private constructor(params: AccountConstructorParams) {
        this._id = params.id ? AccountId.fromString(params.id) : AccountId.create();
        this._name = new AccountName(params.name);
        this.createdBy = params.createdBy;
    }

    get id(): string {
        return this._id.getValue();
    }

    get name(): string {
        return this._name.getValue();
    }
}
