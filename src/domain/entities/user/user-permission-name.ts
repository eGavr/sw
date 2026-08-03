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
}
