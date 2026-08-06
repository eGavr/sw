import { Account } from "../../../domain/entities/account/account";
import { AccountUserPermissionList } from "../../../domain/entities/account/account-user-permission-list";
import { User } from "../../../domain/entities/user/user";

export type FindPermissionsQuery = {
    filter: {
        user: User;
        account: Account;
    };
};

export abstract class AccountUserPermissionRepository {
    abstract findAll(query: FindPermissionsQuery): Promise<AccountUserPermissionList>;
}
