import { InvalidArgumentError } from "../error/invalid-argument-error";

export enum ProjectPermission {
    Read = "project:read",
    Create = "project:create",
    GetIamPolicy = "project:getIamPolicy",
    SetIamPolicy = "project:setIamPolicy",
}

export enum EnvironmentPermission {
    Read = "environment:read",
    Create = "environment:create",
    Delete = "environment:delete",
}

export enum SessionPermission {
    Create = "session:create",
}

export enum StorageDestinationPermission {
    Get = "storageDestination:get",
    Set = "storageDestination:set",
}

export class UserPermissionName {
    static readonly Project = ProjectPermission;

    static readonly Environment = EnvironmentPermission;

    static readonly Session = SessionPermission;

    static readonly StorageDestination = StorageDestinationPermission;

    private static readonly knownNames: ReadonlySet<string> = new Set<string>([
        ...Object.values(ProjectPermission),
        ...Object.values(EnvironmentPermission),
        ...Object.values(SessionPermission),
        ...Object.values(StorageDestinationPermission),
    ]);

    static fromString(value: string): UserPermissionName {
        if (!UserPermissionName.knownNames.has(value)) {
            throw new InvalidArgumentError(`unknown permission: ${value}`);
        }

        return value as UserPermissionName;
    }
}
