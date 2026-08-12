import { UserPermissionName } from "../../user/user-permission-name";

import { IamBinding } from "./iam-binding";
import { IamPolicy } from "./iam-policy";
import { Member } from "./member";
import { RoleName } from "./role";

describe("IamPolicy", () => {
    const alice = Member.user("alice");
    const bob = Member.user("bob");

    test("withOwner grants the owner the admin role", () => {
        const policy = IamPolicy.withOwner(alice);

        expect(policy.rolesFor(alice)).toEqual([RoleName.Admin]);
        expect(policy.grants(alice, UserPermissionName.Account.SetIamPolicy)).toBe(true);
    });

    test("resolves a member's permissions as the union of their roles", () => {
        const policy = IamPolicy.fromBindings([
            IamBinding.create(RoleName.Viewer, [bob]),
            IamBinding.create(RoleName.Developer, [bob]),
        ]);

        expect(policy.grants(bob, UserPermissionName.Environment.Create)).toBe(true);
    });

    test("a member without a binding holds nothing", () => {
        const policy = IamPolicy.withOwner(alice);

        expect(policy.grants(bob, UserPermissionName.Environment.Read)).toBe(false);
        expect(policy.test(bob, [UserPermissionName.Account.Read])).toEqual([]);
    });

    test("test returns the held subset preserving request order", () => {
        const policy = IamPolicy.fromBindings([IamBinding.create(RoleName.Viewer, [bob])]);

        const held = policy.test(bob, [
            UserPermissionName.Environment.Create,
            UserPermissionName.Environment.Read,
            UserPermissionName.Account.Read,
        ]);

        expect(held).toEqual([UserPermissionName.Environment.Read, UserPermissionName.Account.Read]);
    });
});
