import { PermissionList } from "../permission/permission-list";
import { User } from "../user/user"
import { UserIdValue } from "../user/user-id";
import { Account } from "./account";
import { AccountUserPermission } from "./account-user-permission";
import { AccountUserPermissionList } from "./account-user-permission-list";

type CreateAccountUserParams = {
    account: Account;
    user: User;
    permissions: PermissionList;
}

type AccountUserConstructorParams = {
    account: Account;
    user: User;
    permissions: AccountUserPermissionList;
}

export class AccountUser {
    static create(params: CreateAccountUserParams) {
        const { account, user, permissions  } = params;

        return new AccountUser({
            account,
            user,
            permissions: AccountUserPermissionList.create({ account, user, permissions }),
        });
    }

    readonly account: Account;
    readonly user: User;
    
    private readonly permissions: AccountUserPermissionList;

    private constructor(params: AccountUserConstructorParams) {
        this.account = params.account;
        this.user = params.user;
        this.permissions = params.permissions;
    };

    get id(): UserIdValue {
        return this.user.id;
    }

    eachPermission(cb: (permission: AccountUserPermission) => void): void {
        this.permissions.each(cb);
    }
}
