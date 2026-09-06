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

// Registered applications: the project's own deliverable builds (and, in the reserved catalog
// project, the install's provided set — managed by install admins through the same permissions).
export enum ApplicationPermission {
    Get = "sw.applications.get",
    List = "sw.applications.list",
    Create = "sw.applications.create",
    Delete = "sw.applications.delete",
}

export enum StorageDestinationPermission {
    Get = "sw.storageDestinations.get",
    Set = "sw.storageDestinations.set",
}

// Connecting a project's clouds (type + non-secret config, credentials via a secret store) is an
// owner/admin concern, so these are granted only through roles/admin.
export enum CloudAccountPermission {
    Get = "sw.cloudAccounts.get",
    List = "sw.cloudAccounts.list",
    Create = "sw.cloudAccounts.create",
    Delete = "sw.cloudAccounts.delete",
}

// A NetBridge access key opens a tunnel from a remote browser into the holder's network — minting and
// revoking one is an owner/admin concern, so these are granted only through roles/admin.
export enum NetBridgeCredentialPermission {
    Get = "sw.netBridgeCredentials.get",
    List = "sw.netBridgeCredentials.list",
    Create = "sw.netBridgeCredentials.create",
    Delete = "sw.netBridgeCredentials.delete",
}

export class UserPermissionName {
    static readonly Project = ProjectPermission;

    static readonly Environment = EnvironmentPermission;

    static readonly Session = SessionPermission;

    static readonly Application = ApplicationPermission;

    static readonly StorageDestination = StorageDestinationPermission;

    static readonly CloudAccount = CloudAccountPermission;

    static readonly NetBridgeCredential = NetBridgeCredentialPermission;

    private static readonly knownNames: ReadonlySet<string> = new Set<string>([
        ...Object.values(ProjectPermission),
        ...Object.values(EnvironmentPermission),
        ...Object.values(SessionPermission),
        ...Object.values(ApplicationPermission),
        ...Object.values(StorageDestinationPermission),
        ...Object.values(CloudAccountPermission),
        ...Object.values(NetBridgeCredentialPermission),
    ]);

    static fromString(value: string): UserPermissionName {
        if (!UserPermissionName.knownNames.has(value)) {
            throw new InvalidArgumentError(`unknown permission: ${value}`);
        }

        return value as UserPermissionName;
    }
}
