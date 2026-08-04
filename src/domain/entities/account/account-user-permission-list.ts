import { User } from "../user/user";
import { UserPermissionData } from "../user/user-permission";
import { UserPermissionList } from "../user/user-permission-list";
import { UserPermissionName } from "../user/user-permission-name";

import { Account } from "./account";
import { AccountUserPermission } from "./account-user-permission";

type AccountUserPermissionListCreateParams = {
    account: Account;
    user: User;
    permissions: UserPermissionList;
};

type AccountUserPermissionListConstructorParams = {
    account: Account;
    user: User;
    permissions: Array<AccountUserPermission>;
};

export class AccountUserPermissionList {
    static create({ account, user, permissions }: AccountUserPermissionListCreateParams): AccountUserPermissionList {
        return new AccountUserPermissionList({
            account,
            user,
            permissions: permissions.map((permission) => AccountUserPermission.create({ account, user, permission })),
        });
    }

    readonly account: Account;
    readonly user: User;

    private readonly permissions: Array<AccountUserPermission>;

    constructor(params: AccountUserPermissionListConstructorParams) {
        this.account = params.account;
        this.user = params.user;
        this.permissions = params.permissions;
    }

    isEmpty(): boolean {
        return this.permissions.length === 0;
    }

    find(permissionName: UserPermissionName): boolean {
        return this.permissions.some((permission) => permission.name === permissionName);
    }

    // Returns the subset of the requested permissions that this list holds, preserving the
    // requested order (google.iam.v1 testIamPermissions semantics).
    intersect(requested: ReadonlyArray<UserPermissionName>): Array<UserPermissionName> {
        return requested.filter((permissionName) => this.find(permissionName));
    }

    each(cb: (permission: AccountUserPermission) => void): void {
        this.permissions.forEach(cb);
    }

    toArray(): Array<UserPermissionData> {
        return this.permissions
            .map((permission) => ({ name: permission.name }))
            .sort((first, second) => String(first.name).localeCompare(String(second.name)));
    }
}
