import { InvalidArgumentError } from "../error/invalid-argument-error";

// Permission names follow the Google IAM style `service.resourcePlural.verb` (e.g. `sw.projects.get`),
// consistent with the google.iam.v1 policy model we adopted — not the AWS-style `service:Action`.
// Reads are split into `get` (one resource) and `list` (a collection), as Google does. Projects have
// no `list` permission: listing projects is membership-scoped (you see the projects you are bound to),
// not gated per project, so there is nothing to check.
export enum ProjectPermission {
    Get = "sw.projects.get",
    Create = "sw.projects.create",
    GetIamPolicy = "sw.projects.getIamPolicy",
    SetIamPolicy = "sw.projects.setIamPolicy",
}

export enum EnvironmentPermission {
    Get = "sw.environments.get",
    List = "sw.environments.list",
    Create = "sw.environments.create",
    Delete = "sw.environments.delete",
}

export enum SessionPermission {
    Get = "sw.sessions.get",
    Create = "sw.sessions.create",
}

export enum StorageDestinationPermission {
    Get = "sw.storageDestinations.get",
    Set = "sw.storageDestinations.set",
}

// Managing a project's compute providers (bindings + non-secret config) is an owner/admin concern, so
// these are granted only through roles/admin.
export enum ProviderAccountPermission {
    Get = "sw.providerAccounts.get",
    List = "sw.providerAccounts.list",
    Create = "sw.providerAccounts.create",
    Update = "sw.providerAccounts.update",
    Delete = "sw.providerAccounts.delete",
}

// Connecting a project's clouds (type + non-secret config, credentials via a secret store) is an
// owner/admin concern, so these are granted only through roles/admin.
export enum CloudAccountPermission {
    Get = "sw.cloudAccounts.get",
    List = "sw.cloudAccounts.list",
    Create = "sw.cloudAccounts.create",
    Delete = "sw.cloudAccounts.delete",
}

export class UserPermissionName {
    static readonly Project = ProjectPermission;

    static readonly Environment = EnvironmentPermission;

    static readonly Session = SessionPermission;

    static readonly StorageDestination = StorageDestinationPermission;

    static readonly ProviderAccount = ProviderAccountPermission;

    static readonly CloudAccount = CloudAccountPermission;

    private static readonly knownNames: ReadonlySet<string> = new Set<string>([
        ...Object.values(ProjectPermission),
        ...Object.values(EnvironmentPermission),
        ...Object.values(SessionPermission),
        ...Object.values(StorageDestinationPermission),
        ...Object.values(ProviderAccountPermission),
        ...Object.values(CloudAccountPermission),
    ]);

    static fromString(value: string): UserPermissionName {
        if (!UserPermissionName.knownNames.has(value)) {
            throw new InvalidArgumentError(`unknown permission: ${value}`);
        }

        return value as UserPermissionName;
    }
}
