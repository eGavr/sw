import { InvalidArgumentError } from "../../error/invalid-argument-error";
import { UserPermissionList } from "../../user/user-permission-list";
import { UserPermissionName } from "../../user/user-permission-name";

export enum RoleName {
    Admin = "roles/admin",
    Developer = "roles/developer",
    Viewer = "roles/viewer",
}

// Predefined roles: named bundles of permissions (Google IAM style — permissions are granted only
// through a role, never bound directly). The catalogue is domain knowledge; a member's effective
// permissions are the union of the permissions of the roles bound to them.
const catalogue: Record<RoleName, Array<UserPermissionName>> = {
    [RoleName.Admin]: UserPermissionList.getAll().names(),
    [RoleName.Developer]: [
        UserPermissionName.Project.Get,
        UserPermissionName.Environment.Get,
        UserPermissionName.Environment.List,
        UserPermissionName.Environment.Create,
        UserPermissionName.Environment.Delete,
        UserPermissionName.Session.Create,
    ],
    [RoleName.Viewer]: [
        UserPermissionName.Project.Get,
        UserPermissionName.Environment.Get,
        UserPermissionName.Environment.List,
    ],
};

export class Role {
    static fromName(value: string): Role {
        const name = Object.values(RoleName).find((candidate) => candidate === value);

        if (!name) {
            throw new InvalidArgumentError(`unknown role: ${value}`);
        }

        return new Role(name);
    }

    static permissionsOf(names: ReadonlyArray<RoleName>): UserPermissionList {
        return UserPermissionList.union(names.map((name) => new Role(name).permissions()));
    }

    private constructor(readonly name: RoleName) {}

    permissions(): UserPermissionList {
        return UserPermissionList.create({ permissions: catalogue[this.name] });
    }
}
