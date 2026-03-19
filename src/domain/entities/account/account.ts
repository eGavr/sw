import { PermissionList } from "../permission/permission-list";
import { User, UserData } from "../user/user";

import { AccountId } from "./account-id";
import { AccountName } from "./account-name";
import { AccountResourceProvider, AccountResourceProviderData } from "./account-resource-provider";
import { AccountUser } from "./account-user";
import { AccountUserList } from "./account-user-list";

export type AccountData = {
    id: string;
    name: string;
    createdAt: Date;
    createdBy: UserData;
    updatedAt: Date;
    resources: AccountResourceProviderData;
}

export type AccountCreateParams = {
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
    createdAt?: Date;
    createdBy: User;
    updatedAt?: Date;
    resources: AccountResourceProvider;
}

export class Account {
    static fromObject(data: AccountData): Account {
        const { createdBy, resources, ...params } = data;

        return new Account({ 
            ...params, 
            createdBy: User.fromObject(createdBy),
            resources: AccountResourceProvider.fromObject(resources),
        });
    }

    static create(params: AccountCreateParams): Account {
        const { resources, ...rest } = params;

        const account = new Account({
            resources: AccountResourceProvider.create(resources),
            ...rest,
        });

        account.addUser(params.createdBy, PermissionList.getAll());

        return account;
    }

    readonly createdAt: Date;
    readonly createdBy: User;
    readonly updatedAt: Date;
    readonly resources: AccountResourceProvider;
    readonly users: AccountUserList;

    private readonly _id: AccountId;
    private readonly _name: AccountName;

    private constructor(params: AccountConstructorParams) {
        this._id = params.id ? AccountId.fromString(params.id) : AccountId.create();
        this._name = new AccountName(params.name);
        this.createdAt = params.createdAt ?? new Date();
        this.createdBy = params.createdBy;
        this.updatedAt = params.updatedAt ?? this.createdAt;
        this.resources = params.resources;
        this.users = new AccountUserList({ account: this });
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

    eachUser(cb: (user: AccountUser) => void): void {
        this.users.each(cb);
    }
}
