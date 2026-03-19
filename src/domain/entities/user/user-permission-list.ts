import { UserPermission, UserPermissionData } from "./user-permission";
import { UserPermissionName } from "./user-permission-name";

export class UserPermissionList {
    static getAll(): UserPermissionList {
        const account = Object.values(UserPermissionName.Account);
        const environment = Object.values(UserPermissionName.Environment);

        return UserPermissionList.create({ permissions: [...account, ...environment] });
    }

    static create({ permissions }: { permissions: Array<UserPermissionName> }) {
        return new UserPermissionList(permissions.map(permissionName => new UserPermission(permissionName)));
    }

    private constructor(private readonly permissions: Array<UserPermission>) {}

    find(name: UserPermissionName): UserPermission | null {
        return this.permissions.find((permission) => permission.name === name) ?? null;
    }

    map<T>(cb: (permission: UserPermission) => T): Array<T> {
        return this.permissions.map(cb);
    }

    toArray(): Array<UserPermissionData> {
        return this.permissions.map(p => p.toObject()).sort((p1, p2) => String(p1.name).localeCompare(String(p2.name)));
    }
}
