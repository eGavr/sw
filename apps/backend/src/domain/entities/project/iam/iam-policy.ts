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

    // A caller presents several principals — their own user identity plus every group the IdP puts them
    // in — and their effective permissions are the union across all of them (Google IAM group semantics).
    permissionsFor(members: ReadonlyArray<Member>): UserPermissionList {
        return UserPermissionList.union(members.map((member) => Role.permissionsOf(this.rolesFor(member))));
    }

    grants(members: ReadonlyArray<Member>, permission: UserPermissionName): boolean {
        return this.permissionsFor(members).has(permission);
    }

    test(members: ReadonlyArray<Member>, requested: ReadonlyArray<UserPermissionName>): Array<UserPermissionName> {
        return this.permissionsFor(members).intersect(requested);
    }

    toBindings(): ReadonlyArray<IamBinding> {
        return this.bindings;
    }

    // An opaque fingerprint of the policy's content, for optimistic concurrency (google.iam.v1
    // Policy.etag): getIamPolicy returns it, setIamPolicy sends it back, and a stale value is rejected.
    // Derived from the canonical (order-independent) binding set, so two equal policies share an etag.
    // It is a version marker, not a secret, so a plain deterministic hash is enough.
    etag(): string {
        const canonical = JSON.stringify(
            this.bindings
                .map((binding) => JSON.stringify({ role: binding.role, members: [...binding.memberValues()].sort() }))
                .sort(),
        );

        return IamPolicy.fingerprint(canonical);
    }

    // FNV-1a 64-bit over the canonical JSON — pure and deterministic, no crypto needed for a version tag.
    private static fingerprint(canonical: string): string {
        const offsetBasis = 0xcbf29ce484222325n;
        const prime = 0x100000001b3n;
        const mask = 0xffffffffffffffffn;

        let hash = offsetBasis;
        for (let index = 0; index < canonical.length; index++) {
            hash = ((hash ^ BigInt(canonical.charCodeAt(index))) * prime) & mask;
        }

        return hash.toString(16).padStart(16, "0");
    }
}
