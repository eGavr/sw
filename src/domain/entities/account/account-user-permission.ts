import { Uuid } from "../../types/uuid/uuid";
import { Permission } from "../permission/permission";
import { PermissionName } from "../permission/permission-name";
import { User } from "../user/user";
import { Account } from "./account";

type CreateAccountUserPermissionParams = {
    account: Account;
    user: User;
    permission: Permission;
}

type AccountUserPermissionConstructorParams = {
    id?: string;
    account: Account;
    user: User;
    createdAt?: Date;
    updatedAt?: Date;
    permission: Permission;
}

export class AccountUserPermission {
    static create(params: CreateAccountUserPermissionParams) {
        return new AccountUserPermission(params);
    }

    readonly account: Account;
    readonly user: User;
    readonly createdAt: Date;
    readonly updatedAt: Date;

    private readonly _id: Uuid;
    private readonly permission: Permission;

    private constructor(params: AccountUserPermissionConstructorParams) {
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

    get name(): PermissionName {
        return this.permission.name;
    }
}
