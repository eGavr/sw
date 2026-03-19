import { Injectable } from "@nestjs/common";

import { UserPermissionName } from "../../../../domain/entities/user/user-permission-name";
import { FindPermissionsQuery } from "../../../repositories/user-permission-repository";

import { UserCollection } from "./entities/user-collection";

@Injectable()
export class UserPermissionDataSource {
    async findAll(query: FindPermissionsQuery): Promise<Array<UserPermissionName>> {
        const user = UserCollection.getInstance().get(query.filter.user.externalId);
        
        return user.permissions;
    }
}
