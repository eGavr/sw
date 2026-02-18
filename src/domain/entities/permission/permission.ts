import { PermissionName } from "./permission-name";

export type PermissionData = {
    name: PermissionName;
}

export class Permission {
    constructor(public readonly name: PermissionName) {}

    toObject(): PermissionData {
        return { name: this.name };
    }
}
