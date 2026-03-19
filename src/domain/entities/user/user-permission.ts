import { UserPermissionName } from "../user/user-permission-name";

export type UserPermissionData = {
    name: UserPermissionName;
}

export class UserPermission {
    constructor(public readonly name: UserPermissionName) {}

    toObject(): UserPermissionData {
        return { name: this.name };
    }
}
