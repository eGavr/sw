import { User, UserData } from "../user/user";
import { UserPermissionName } from "../user/user-permission-name";

import { AccountId } from "./account-id";
import { AccountName } from "./account-name";
import { IamBinding } from "./iam/iam-binding";
import { IamPolicy } from "./iam/iam-policy";
import { Member } from "./iam/member";
import { Role } from "./iam/role";

export type IamBindingData = {
    role: string;
    members: Array<string>;
};

export type AccountData = {
    id: string;
    name: string;
    createdAt: Date;
    createdBy: UserData;
    updatedAt: Date;
    bindings: Array<IamBindingData>;
}

export type AccountCreateParams = {
    name: string;
    createdBy: User;
};

type AccountConstructorParams = {
    id?: string;
    name: string;
    createdAt?: Date;
    createdBy: User;
    updatedAt?: Date;
    policy: IamPolicy;
}

export class Account {
    static fromObject(data: AccountData): Account {
        return new Account({
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

    // A new account grants its creator the admin role, so the owner starts with every permission.
    static create(params: AccountCreateParams): Account {
        return new Account({
            name: params.name,
            createdBy: params.createdBy,
            policy: IamPolicy.withOwner(Member.user(params.createdBy.externalId)),
        });
    }

    readonly createdAt: Date;
    readonly createdBy: User;

    private readonly _id: AccountId;
    private readonly _name: AccountName;
    private _policy: IamPolicy;
    private _updatedAt: Date;

    private constructor(params: AccountConstructorParams) {
        this._id = params.id ? AccountId.fromString(params.id) : AccountId.create();
        this._name = new AccountName(params.name);
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

    setIamPolicy(policy: IamPolicy): void {
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
