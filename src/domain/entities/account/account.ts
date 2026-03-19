import { PermissionList } from "../permission/permission-list";
import { User, UserData } from "../user/user";

import { AccountId } from "./account-id";
import { AccountName } from "./account-name";
import { AccountUserList } from "./account-user-list";

export type AccountData = {
    id: string;
    name: string;
    createdBy: UserData;
    resources: {
        providerId: string;
        providerType: string;
    }
}

export type CreateAccountParams = {
    name: string;
    createdBy: User;
    resources: {
        providerId: string;
        providerType: string;
    }
};

export type AccountConstructorParams = {
    id?: string;
    name: string;
    createdBy: User;
    resources: {
        providerId: string;
        providerType: string;
    }
}

export class Account {
    static fromObject(data: AccountData): Account {
        const { createdBy, ...params } = data;

        return new Account({ ...params, createdBy: User.fromObject(createdBy) });
    }

    static create(params: CreateAccountParams): Account {
        const account = new Account(params);

        account.addUser(params.createdBy, PermissionList.getAll());

        return account;
    }

    readonly createdBy: User;
    readonly resources: { providerId: string, providerType: string };

    private readonly _id: AccountId;
    private readonly _name: AccountName;

    private readonly users = new AccountUserList();

    private constructor(params: AccountConstructorParams) {
        this._id = params.id ? AccountId.fromString(params.id) : AccountId.create();
        this._name = new AccountName(params.name);
        this.createdBy = params.createdBy;
        this.resources = params.resources;
    }

    get id(): string {
        return this._id.getValue();
    }

    get name(): string {
        return this._name.getValue();
    }

    addUser(user: User, permissions: PermissionList): this {
        this.users.add(user, permissions);

        return this;
    }
}
