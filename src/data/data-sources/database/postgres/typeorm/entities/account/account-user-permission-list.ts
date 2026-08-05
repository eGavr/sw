import { Account as AccountEntity } from "../../../../../../../domain/entities/account/account";

import { AccountUserPermission } from "./account-user-permission";

export class AccountUserPermissionList {
    static from(account: AccountEntity): Array<AccountUserPermission> {
        const permissions: Array<AccountUserPermission> = [];

        account.eachUser(user => {
            user.eachPermission((permisison) => permissions.push(AccountUserPermission.from(permisison)))
        });

        return permissions;
    }

    static create(permissions: Array<AccountUserPermission>): AccountUserPermissionList {
        return new AccountUserPermissionList(permissions);
    }

    private constructor(private readonly permissions: Array<AccountUserPermission>) {}

}
