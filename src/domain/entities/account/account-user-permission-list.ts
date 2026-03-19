import { PermissionList } from "../permission/permission-list";
import { User } from "../user/user";
import { Account } from "./account";
import { AccountUserPermission } from "./account-user-permission";

type AccountUserPermissionListCreateParams = {
    account: Account;
    user: User;
    permissions: PermissionList;
}

type AccountUserPermissionListConstructorParams = {
    account: Account;
    user: User;
    permissions: Array<AccountUserPermission>;
}

export class AccountUserPermissionList {
    static create({ account, user, permissions}: AccountUserPermissionListCreateParams) {
        return new AccountUserPermissionList({
            account,
            user, 
            permissions: permissions.map(permission => AccountUserPermission.create({ account, user, permission }))
        });
    }

    readonly account: Account;
    readonly user: User;

    private readonly permissions: Array<AccountUserPermission>

    private constructor(params: AccountUserPermissionListConstructorParams) {
        this.account = params.account;
        this.user = params.user;
        this.permissions = params.permissions;
    }

    each(cb: (permission: AccountUserPermission) => void): void {
        return this.permissions.forEach(cb);
    }
}