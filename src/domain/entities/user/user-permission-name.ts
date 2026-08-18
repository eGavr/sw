import { InvalidArgumentError } from "../error/invalid-argument-error";

// Permission names follow the Google IAM style `service.resourcePlural.verb` (e.g. `sw.projects.read`),
// consistent with the google.iam.v1 policy model we adopted — not the AWS-style `service:Action`.
export enum ProjectPermission {
    Read = "sw.projects.read",
    Create = "sw.projects.create",
    GetIamPolicy = "sw.projects.getIamPolicy",
    SetIamPolicy = "sw.projects.setIamPolicy",
}

export enum EnvironmentPermission {
    Read = "sw.environments.read",
    Create = "sw.environments.create",
    Delete = "sw.environments.delete",
}

export enum SessionPermission {
    Create = "sw.sessions.create",
}

export enum StorageDestinationPermission {
    Get = "sw.storageDestinations.get",
    Set = "sw.storageDestinations.set",
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
