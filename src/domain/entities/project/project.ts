import { User, UserData } from "../user/user";
import { UserPermissionName } from "../user/user-permission-name";

import { IamPolicyEtagMismatchError } from "./iam/error/iam-policy-etag-mismatch-error";
import { IamBinding } from "./iam/iam-binding";
import { IamPolicy } from "./iam/iam-policy";
import { Member } from "./iam/member";
import { Role } from "./iam/role";
import { ProjectId } from "./project-id";
import { ProjectName } from "./project-name";

export type IamBindingData = {
    role: string;
    members: Array<string>;
};

export type ProjectData = {
    id: string;
    name: string;
    createdAt: Date;
    createdBy: UserData;
    updatedAt: Date;
    bindings: Array<IamBindingData>;
}

export type ProjectCreateParams = {
    name: string;
    createdBy: User;
};

type ProjectConstructorParams = {
    id?: string;
    name: string;
    createdAt?: Date;
    createdBy: User;
    updatedAt?: Date;
    policy: IamPolicy;
}

export class Project {
    static fromObject(data: ProjectData): Project {
        return new Project({
            id: data.id,
            name: data.name,
            createdAt: data.createdAt,
            createdBy: User.fromObject(data.createdBy),
            updatedAt: data.updatedAt,
            policy: IamPolicy.fromBindings(data.bindings.map((binding) => IamBinding.create(
                Role.fromName(binding.role).name,
                binding.members.map((member) => Member.fromString(member)),
            ))),
        });
    }

    // A new project grants its creator the admin role, so the owner starts with every permission.
    static create(params: ProjectCreateParams): Project {
        return new Project({
            name: params.name,
            createdBy: params.createdBy,
            policy: IamPolicy.withOwner(Member.user(params.createdBy.externalId)),
        });
    }

    readonly createdAt: Date;
    readonly createdBy: User;

    private readonly _id: ProjectId;
    private readonly _name: ProjectName;
    private _policy: IamPolicy;
    private _updatedAt: Date;

    private constructor(params: ProjectConstructorParams) {
        this._id = params.id ? ProjectId.fromString(params.id) : ProjectId.create();
        this._name = new ProjectName(params.name);
        this.createdAt = params.createdAt ?? new Date();
        this.createdBy = params.createdBy;
        this._updatedAt = params.updatedAt ?? this.createdAt;
        this._policy = params.policy;
    }

    get id(): string {
        return this._id.getValue();
    }

    get name(): string {
        return this._name.getValue();
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    iamPolicy(): IamPolicy {
        return this._policy;
    }

    // Replaces the whole policy (google.iam.v1 SetIamPolicy). When an expected etag is given, it must
    // match the current policy's version, or the write is rejected as a stale (lost) update; omitting it
    // is a blind overwrite, as Google allows.
    setIamPolicy(policy: IamPolicy, expectedEtag?: string): void {
        if (expectedEtag !== undefined && expectedEtag !== this._policy.etag()) {
            throw new IamPolicyEtagMismatchError();
        }

        this._policy = policy;
        this._updatedAt = new Date();
    }

    grants(member: Member, permission: UserPermissionName): boolean {
        return this._policy.grants(member, permission);
    }

    testPermissions(member: Member, requested: ReadonlyArray<UserPermissionName>): Array<UserPermissionName> {
        return this._policy.test(member, requested);
    }
}
