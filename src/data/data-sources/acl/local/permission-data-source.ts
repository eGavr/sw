import { Injectable } from "@nestjs/common";

import { PermissionName } from "../../../../domain/entities/permission/permission-name";
import { FindPermissionsQuery } from "../../../repositories/permission-repository";

import { SuperUser } from "./entities/super-user";

@Injectable()
export class PermissionDataSource {
    async findAll(query: FindPermissionsQuery): Promise<Array<PermissionName>> {
        if (SuperUser.isSuperUser(query.filter.user.externalId)) {
            return [
                PermissionName.Environments.Read,
                PermissionName.Accounts.Create,
            ];
        }

        return [];
    }
}
