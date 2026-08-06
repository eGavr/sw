import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import { FindPermissionsQuery } from "../../../../application/interfaces/repositories/account-user-permission-repository";

import { AccountUserPermission } from "./typeorm/entities/account/account-user-permission";

@Injectable()
export class UserPermissionDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async findAll(query: FindPermissionsQuery): Promise<Array<AccountUserPermission>> {
        return this.dataSource.getRepository(AccountUserPermission).find({ 
            where: { 
                userId: query.filter.user.id, 
                accountId: query.filter.account.id,
            },
        });
    }
}
