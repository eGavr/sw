import { Injectable } from "@nestjs/common";

import { Account } from "../../domain/entities/account/account";
import { AccountUserPermission } from "../../domain/entities/account/account-user-permission";
import { AccountUserPermissionList } from "../../domain/entities/account/account-user-permission-list";
import { User } from "../../domain/entities/user/user";
import { UserPermission } from "../../domain/entities/user/user-permission";
import { UserPermissionName } from "../../domain/entities/user/user-permission-name";
import { UserPermissionDataSource } from "../data-sources/database/postgres/user-permission-data-source";

export type FindPermissionsQuery = {
    filter: {
        user: User;
        account: Account;
    };
};

@Injectable()
export class UserPermissionRepository {
    constructor(private readonly userPermissionDataSource: UserPermissionDataSource) {}

    async findAll(query: FindPermissionsQuery): Promise<AccountUserPermissionList> {
        const { account, user } = query.filter;
        const stored = await this.userPermissionDataSource.findAll(query);

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
}
