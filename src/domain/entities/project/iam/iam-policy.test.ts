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
        expect(policy.grants(alice, UserPermissionName.Project.SetIamPolicy)).toBe(true);
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

        expect(policy.grants(bob, UserPermissionName.Environment.Get)).toBe(false);
        expect(policy.test(bob, [UserPermissionName.Project.Get])).toEqual([]);
    });

    test("test returns the held subset preserving request order", () => {
        const policy = IamPolicy.fromBindings([IamBinding.create(RoleName.Viewer, [bob])]);

        const held = policy.test(bob, [
            UserPermissionName.Environment.Create,
            UserPermissionName.Environment.Get,
            UserPermissionName.Project.Get,
        ]);

        expect(held).toEqual([UserPermissionName.Environment.Get, UserPermissionName.Project.Get]);
    });

    describe("#etag", () => {
        test("is stable regardless of binding and member order", () => {
            const one = IamPolicy.fromBindings([
                IamBinding.create(RoleName.Admin, [alice, bob]),
                IamBinding.create(RoleName.Viewer, [bob]),
            ]);
            const reordered = IamPolicy.fromBindings([
                IamBinding.create(RoleName.Viewer, [bob]),
                IamBinding.create(RoleName.Admin, [bob, alice]),
            ]);

            expect(one.etag()).toBe(reordered.etag());
        });

        test("changes when the policy content changes", () => {
            const before = IamPolicy.fromBindings([IamBinding.create(RoleName.Viewer, [alice])]);
            const after = IamPolicy.fromBindings([IamBinding.create(RoleName.Viewer, [alice, bob])]);

            expect(before.etag()).not.toBe(after.etag());
        });

        test("distinguishes the same members bound to different roles", () => {
            const asViewer = IamPolicy.fromBindings([IamBinding.create(RoleName.Viewer, [alice])]);
            const asDeveloper = IamPolicy.fromBindings([IamBinding.create(RoleName.Developer, [alice])]);

            expect(asViewer.etag()).not.toBe(asDeveloper.etag());
        });

        test("is stable for the empty policy", () => {
            expect(IamPolicy.empty().etag()).toBe(IamPolicy.empty().etag());
        });
    });
});
