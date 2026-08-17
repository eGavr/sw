import { UserPermission, UserPermissionData } from "./user-permission";
import { UserPermissionName } from "./user-permission-name";

export class UserPermissionList {
    static getAll(): UserPermissionList {
        const project = Object.values(UserPermissionName.Project);
        const environment = Object.values(UserPermissionName.Environment);
        const session = Object.values(UserPermissionName.Session);
        const storageDestination = Object.values(UserPermissionName.StorageDestination);

        return UserPermissionList.create({ permissions: [...project, ...environment, ...session, ...storageDestination] });
    }

    static create({ permissions }: { permissions: Array<UserPermissionName> }): UserPermissionList {
        return new UserPermissionList(permissions.map(permissionName => new UserPermission(permissionName)));
    }

    static union(lists: ReadonlyArray<UserPermissionList>): UserPermissionList {
        const seen = new Set<UserPermissionName>();

        for (const list of lists) {
            for (const permission of list.permissions) {
                seen.add(permission.name);
            }
        }

        return UserPermissionList.create({ permissions: [...seen] });
    }

    private constructor(private readonly permissions: Array<UserPermission>) {}

    has(name: UserPermissionName): boolean {
        return this.permissions.some((permission) => permission.name === name);
    }

    intersect(requested: ReadonlyArray<UserPermissionName>): Array<UserPermissionName> {
        return requested.filter((name) => this.has(name));
    }

    names(): Array<UserPermissionName> {
        return this.toArray().map((permission) => permission.name);
    }

    toArray(): Array<UserPermissionData> {
        return this.permissions.map(p => p.toObject()).sort((p1, p2) => String(p1.name).localeCompare(String(p2.name)));
    }
}
