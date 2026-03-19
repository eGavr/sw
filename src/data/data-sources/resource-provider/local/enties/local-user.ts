import { PermissionName } from "../../../../../domain/entities/permission/permission-name";
import { Uuid } from "../../../../../domain/types/uuid/uuid";

export class LocalUser {
    readonly externalId = Uuid.create().getValue().slice(0, 8);

    constructor(readonly permissions: Array<PermissionName> = []) {}
}
