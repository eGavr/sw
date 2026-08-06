import { User, UserData } from "../user/user";
import { UserPermissionList } from "../user/user-permission-list";

import { AccountId } from "./account-id";
import { AccountName } from "./account-name";
import { AccountUser } from "./account-user";
import { AccountUserList } from "./account-user-list";

export type AccountData = {
    id: string;
    name: string;
    createdAt: Date;
    createdBy: UserData;
    updatedAt: Date;
}

export type AccountCreateParams = {
    name: string;
    createdBy: User;
};

export type AccountConstructorParams = {
    id?: string;
    name: string;
    createdAt?: Date;
    createdBy: User;
    updatedAt?: Date;
}

export class Account {
    static fromObject(data: AccountData): Account {
        const { createdBy, ...params } = data;

        return new Account({
            ...params,
            createdBy: User.fromObject(createdBy),
        });
    }

    static create(params: AccountCreateParams): Account {
        const account = new Account(params);

        account.addUser(params.createdBy, UserPermissionList.getAll());

        return account;
    }

    readonly createdAt: Date;
    readonly createdBy: User;
    readonly updatedAt: Date;
    readonly users: AccountUserList;

    private readonly _id: AccountId;
    private readonly _name: AccountName;

    private constructor(params: AccountConstructorParams) {
        this._id = params.id ? AccountId.fromString(params.id) : AccountId.create();
        this._name = new AccountName(params.name);
        this.createdAt = params.createdAt ?? new Date();
        this.createdBy = params.createdBy;
        this.updatedAt = params.updatedAt ?? this.createdAt;
        this.users = new AccountUserList({ account: this });
    }

    get id(): string {
        return this._id.getValue();
    }

    get name(): string {
        return this._name.getValue();
    }

    addUser(user: User, permissions: UserPermissionList): this {
        this.users.add(user, permissions);

        return this;
    }

    eachUser(cb: (user: AccountUser) => void): void {
        this.users.each(cb);
    }
}
