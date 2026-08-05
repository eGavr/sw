import { Uuid } from "../../types/uuid/uuid";
import { User } from "../user/user";
import { UserPermission } from "../user/user-permission";
import { UserPermissionName } from "../user/user-permission-name";

import { Account } from "./account";

type AccountUserPermissionCreateParams = {
    account: Account;
    user: User;
    permission: UserPermission;
}

type AccountUserPermissionConstructorParams = {
    id?: string;
    account: Account;
    user: User;
    createdAt?: Date;
    updatedAt?: Date;
    permission: UserPermission;
}

export class AccountUserPermission {
    static create(params: AccountUserPermissionCreateParams): AccountUserPermission {
        return new AccountUserPermission(params);
    }

    readonly account: Account;
    readonly user: User;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    private readonly _id: Uuid;
    private readonly permission: UserPermission;

    constructor(params: AccountUserPermissionConstructorParams) {
        this._id = params.id ? Uuid.fromString(params.id) : Uuid.create();
        this.account = params.account;
        this.user = params.user;
        this.createdAt = params.createdAt ?? new Date();
        this.updatedAt = params.updatedAt ?? this.createdAt;
        this.permission = params.permission;
    }

    get id(): string {
        return this._id.getValue();
    }

    get name(): UserPermissionName {
        return this.permission.name;
    }
}
