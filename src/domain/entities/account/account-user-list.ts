import { PermissionList } from "../permission/permission-list";
import { User } from "../user/user";
import { UserIdValue } from "../user/user-id";
import { Account } from "./account";
import { AccountUser } from "./account-user";

export class AccountUserList {
    readonly account: Account;

    private readonly users = new Map<UserIdValue, AccountUser>;

    constructor({ account }: { account: Account }) {
        this.account = account;
    }

    add(user: User, permissions: PermissionList): void {
        this.users.set(user.id, AccountUser.create({ account: this.account, user, permissions }));
    }

    each(cb: (user: AccountUser) => void) {
        for (const [, user] of this.users) {
            cb(user);
        }
    }
}
