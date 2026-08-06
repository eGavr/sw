import { Injectable } from "@nestjs/common";

import {
    AccountUserPermissionRepository,
    FindPermissionsQuery,
} from "../../application/interfaces/repositories/account-user-permission-repository";
import { AccountUserPermission } from "../../domain/entities/account/account-user-permission";
import { AccountUserPermissionList } from "../../domain/entities/account/account-user-permission-list";
import { UserPermission } from "../../domain/entities/user/user-permission";
import { UserPermissionName } from "../../domain/entities/user/user-permission-name";
import { UserPermissionDataSource } from "../data-sources/database/postgres/user-permission-data-source";

@Injectable()
export class AccountUserPermissionRepositoryImpl extends AccountUserPermissionRepository {
    constructor(private readonly userPermissionDataSource: UserPermissionDataSource) {
        super();
    }

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
