export enum AccountPermission {
    Create = "account:create",
}

export enum EnvironmentPermission {
    Read = "environment:read",
}

export class PermissionName {
    static readonly Accounts = AccountPermission;

    static readonly Environments = EnvironmentPermission;
}
