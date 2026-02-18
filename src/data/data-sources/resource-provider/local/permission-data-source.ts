import { Injectable } from "@nestjs/common";

import { PermissionName } from "../../../../domain/entities/permission/permission-name";
import { FindPermissionsQuery } from "../../../repositories/permission-repository";

import { UserCollection } from "./enties/user-collection";

@Injectable()
export class PermissionDataSource {
    async findAll(query: FindPermissionsQuery): Promise<Array<PermissionName>> {
        const user = UserCollection.getInstance().get(query.filter.user.externalId);

        return user.permissions;
    }
}
