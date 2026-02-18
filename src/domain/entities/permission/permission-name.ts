export enum AccountPermission {
    Read = "account:read",
    Create = "account:create",
}

export enum EnvironmentPermission {
    Read = "environment:read",
}

export class PermissionName {
    static readonly Account = AccountPermission;

    static readonly Environment = EnvironmentPermission;
}
