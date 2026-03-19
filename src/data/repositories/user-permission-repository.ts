import { Injectable } from "@nestjs/common";

import { Account } from "../../domain/entities/account/account";
import { UserPermission } from "../../domain/entities/user/user-permission";
import { UserPermissionList } from "../../domain/entities/user/user-permission-list";
import { User } from "../../domain/entities/user/user";
import { 
    UserPermissionDataSource as ResourceProviderUserPermissionDataSource 
} from "../data-sources/resource-provider/local/user-permission-data-source";
import { UserPermissionDataSource as PgUserPermissionDataSource } from "../data-sources/database/postgres/user-permission-data-source";
import { AccountUserPermissionList } from "../../domain/entities/account/account-user-permission-list";
import { AccountUserPermission } from "../../domain/entities/account/account-user-permission";
import { permission } from "process";

export type FindPermissionsQuery = {
    filter: {
        user: User,
        account: Account,
    }
}

@Injectable()
export class UserPermissionRepository {
    constructor(
        private readonly resourceProviderUserPermissionDataSource: ResourceProviderUserPermissionDataSource,
        private readonly pgUserPermissionDataSource: PgUserPermissionDataSource,
    ) {}

    async findAll(query: FindPermissionsQuery): Promise<AccountUserPermissionList> {
        let permissions = await this.pgUserPermissionDataSource.findAll(query);

        // const permissionList = new AccountUserPermissionList({ 
        //     account: query.filter.account, 
        //     user: query.filter.user,
        //     permissions: pgPermissions.map((p) => new AccountUserPermission({ 
        //         id: p.id, 
        //         account: query.filter.account, 
        //         user: query.filter.user, 
        //         createdAt: p.createdAt, 
        //         updatedAt: p.updatedAt, 
        //         permission: new UserPermission(p.name),
        //     })),
        // });

        const permissionList = new AccountUserPermissionList({ account: query.filter.account, user: query.filter.user })
            .add(permissions.map((p) => ({ 
                id: p.id, 
                createdAt: p.createdAt, 
                updatedAt: p.updatedAt, 
                permission: p.name,
            } as any)))

        if (permissionList.isEmpty()) {
            const permissionNames = await this.resourceProviderUserPermissionDataSource.findAll(query);

            permissionList.add(permissionNames.map(name => ({ permission: name })))
        }

        return permissionList;
    }
}
