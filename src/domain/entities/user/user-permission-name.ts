import { InvalidArgumentError } from "../error/invalid-argument-error";

export enum AccountPermission {
    Read = "account:read",
    Create = "account:create",
}

export enum EnvironmentPermission {
    Read = "environment:read",
    Create = "environment:create",
    Delete = "environment:delete",
}

export class UserPermissionName {
    static readonly Account = AccountPermission;

    static readonly Environment = EnvironmentPermission;

    private static readonly knownNames: ReadonlySet<string> = new Set<string>([
        ...Object.values(AccountPermission),
        ...Object.values(EnvironmentPermission),
    ]);

    // Parses a transport string into a domain permission name. Google IAM testIamPermissions
    // rejects permissions that are not valid for the resource type with INVALID_ARGUMENT.
    static fromString(value: string): UserPermissionName {
        if (!UserPermissionName.knownNames.has(value)) {
            throw new InvalidArgumentError(`unknown permission: ${value}`);
        }

        return value as UserPermissionName;
    }
}
