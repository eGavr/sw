import { Injectable } from "@nestjs/common";

import { Account } from "../../domain/entities/account/account";
import { Permission } from "../../domain/entities/permission/permission";
import { PermissionList } from "../../domain/entities/permission/permission-list";
import { User } from "../../domain/entities/user/user";
import { PermissionDataSource } from "../data-sources/resource-provider/local/permission-data-source";

export type FindPermissionsQuery = {
    filter: {
        user: User,
        account: Account,
    }
}

@Injectable()
export class PermissionRepository {
    constructor(
        private readonly permissionDataSource: PermissionDataSource,
    ) {}

    async findAll(query: FindPermissionsQuery): Promise<PermissionList> {
        const permissions = await this.permissionDataSource.findAll(query);

        return new PermissionList(permissions.map(permission => new Permission(permission)));
    }
}
