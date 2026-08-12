import { InvalidArgumentError } from "../error/invalid-argument-error";

export enum AccountPermission {
    Read = "account:read",
    Create = "account:create",
    GetIamPolicy = "account:getIamPolicy",
    SetIamPolicy = "account:setIamPolicy",
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
    static readonly Account = AccountPermission;

    static readonly Environment = EnvironmentPermission;

    static readonly Session = SessionPermission;

    static readonly StorageDestination = StorageDestinationPermission;

    private static readonly knownNames: ReadonlySet<string> = new Set<string>([
        ...Object.values(AccountPermission),
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
