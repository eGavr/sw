import { Permission } from "./permission";
import { PermissionName } from "./permission-name";

export class PermissionList {
    constructor(private readonly permissions: Array<Permission>) {}

    find(name: PermissionName): Permission | null {
        return this.permissions.find((permission) => permission.name === name) ?? null;
    }
}
