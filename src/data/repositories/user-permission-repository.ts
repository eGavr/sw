import { Injectable } from "@nestjs/common";

import { Account } from "../../domain/entities/account/account";
import { AccountUserPermission } from "../../domain/entities/account/account-user-permission";
import { AccountUserPermissionList } from "../../domain/entities/account/account-user-permission-list";
import { User } from "../../domain/entities/user/user";
import { UserPermission } from "../../domain/entities/user/user-permission";
import { UserPermissionName } from "../../domain/entities/user/user-permission-name";
import {
    UserPermissionDataSource as PgUserPermissionDataSource,
} from "../data-sources/database/postgres/user-permission-data-source";
import {
    UserPermissionDataSource as ResourceProviderUserPermissionDataSource,
} from "../data-sources/resource-provider/local/user-permission-data-source";

export type FindPermissionsQuery = {
    filter: {
        user: User;
        account: Account;
    };
};

@Injectable()
export class UserPermissionRepository {
    constructor(
        private readonly resourceProviderUserPermissionDataSource: ResourceProviderUserPermissionDataSource,
        private readonly pgUserPermissionDataSource: PgUserPermissionDataSource,
    ) {}

    async findAll(query: FindPermissionsQuery): Promise<AccountUserPermissionList> {
        const { account, user } = query.filter;
        const stored = await this.pgUserPermissionDataSource.findAll(query);

        if (stored.length > 0) {
            return new AccountUserPermissionList({
                account,
                user,
                permissions: stored.map((permission) => new AccountUserPermission({
                    id: permission.id,
                    account,
                    user,
                    createdAt: permission.createdAt,
                    updatedAt: permission.updatedAt,
                    permission: new UserPermission(permission.name as UserPermissionName),
                })),
            });
        }

        const permissionNames = await this.resourceProviderUserPermissionDataSource.findAll(query);

        return new AccountUserPermissionList({
            account,
            user,
            permissions: permissionNames.map((name) => AccountUserPermission.create({
                account,
                user,
                permission: new UserPermission(name),
            })),
        });
    }
}
