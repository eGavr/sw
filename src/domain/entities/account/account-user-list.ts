import { PermissionList } from "../permission/permission-list";
import { User } from "../user/user";
import { UserIdValue } from "../user/user-id";

export class AccountUserList {
    private readonly users: Record<UserIdValue, PermissionList> = {};

    add(user: User, permissions: PermissionList): void {
        this.users[user.id] = permissions;
    }
}
