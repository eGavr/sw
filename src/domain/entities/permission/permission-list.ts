import { Permission, PermissionData } from "./permission";
import { PermissionName } from "./permission-name";

export class PermissionList {
    static getAll(): PermissionList {
        const account = Object.values(PermissionName.Account);
        const environment = Object.values(PermissionName.Environment);

        return new PermissionList([...account, ...environment].map((permissionName) => new Permission(permissionName)));
    }

    constructor(private readonly permissions: Array<Permission>) {}

    find(name: PermissionName): Permission | null {
        return this.permissions.find((permission) => permission.name === name) ?? null;
    }

    each(cb: (permission: Permission) => void): void {
        this.permissions.forEach(cb);
    }

    map<T>(cb: (permission: Permission) => T): Array<T> {
        return this.permissions.map(cb);
    }

    toArray(): Array<PermissionData> {
        return this.permissions.map(p => p.toObject()).sort((p1, p2) => String(p1.name).localeCompare(String(p2.name)));
    }
}
