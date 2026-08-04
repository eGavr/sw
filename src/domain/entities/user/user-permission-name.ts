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

export enum SessionPermission {
    Create = "session:create",
}

export class UserPermissionName {
    static readonly Account = AccountPermission;

    static readonly Environment = EnvironmentPermission;

    static readonly Session = SessionPermission;

    private static readonly knownNames: ReadonlySet<string> = new Set<string>([
        ...Object.values(AccountPermission),
        ...Object.values(EnvironmentPermission),
        ...Object.values(SessionPermission),
    ]);

    static fromString(value: string): UserPermissionName {
        if (!UserPermissionName.knownNames.has(value)) {
            throw new InvalidArgumentError(`unknown permission: ${value}`);
        }

        return value as UserPermissionName;
    }
}
