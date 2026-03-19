import { UserPermissionList } from "../user/user-permission-list";
import { User } from "../user/user";
import { Account } from "./account";
import { AccountUserPermission } from "./account-user-permission";
import { UserPermissionName } from "../user/user-permission-name";

type AccountUserPermissionListCreateParams = {
    account: Account;
    user: User;
    permissions: UserPermissionList;
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

    constructor(params: AccountUserPermissionListConstructorParams) {
        this.account = params.account;
        this.user = params.user;
        this.permissions = params.permissions;
    }

    each(cb: (permission: AccountUserPermission) => void): void {
        return this.permissions.forEach(cb);
    }

    find(permisisonName: UserPermissionName): boolean {
        // return this.permissions.f
        throw new Error();
    }
}