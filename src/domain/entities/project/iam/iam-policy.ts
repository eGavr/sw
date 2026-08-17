import { UserPermissionList } from "../../user/user-permission-list";
import { UserPermissionName } from "../../user/user-permission-name";

import { IamBinding } from "./iam-binding";
import { Member } from "./member";
import { Role, RoleName } from "./role";

// The access policy of an project: a set of role bindings (Google IAM). A member's effective
// permissions are the union of the permissions of the roles bound to them — permissions are never
// bound directly. Whole-policy read/replace backs getIamPolicy/setIamPolicy; the resolution methods
// (grants/test) back synchronous authorization.
export class IamPolicy {
    static empty(): IamPolicy {
        return new IamPolicy([]);
    }

    static withOwner(member: Member): IamPolicy {
        return new IamPolicy([IamBinding.create(RoleName.Admin, [member])]);
    }

    static fromBindings(bindings: ReadonlyArray<IamBinding>): IamPolicy {
        return new IamPolicy([...bindings]);
    }

    private constructor(private readonly bindings: Array<IamBinding>) {}

    rolesFor(member: Member): Array<RoleName> {
        return this.bindings.filter((binding) => binding.hasMember(member)).map((binding) => binding.role);
    }

    permissionsFor(member: Member): UserPermissionList {
        return Role.permissionsOf(this.rolesFor(member));
    }

    grants(member: Member, permission: UserPermissionName): boolean {
        return this.permissionsFor(member).has(permission);
    }

    test(member: Member, requested: ReadonlyArray<UserPermissionName>): Array<UserPermissionName> {
        return this.permissionsFor(member).intersect(requested);
    }

    toBindings(): ReadonlyArray<IamBinding> {
        return this.bindings;
    }
}
