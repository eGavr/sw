import { User } from "../user/user";
import { UserPermission } from "../user/user-permission";
import { UserPermissionName } from "../user/user-permission-name";

import { Account } from "./account";
import { AccountUserPermission } from "./account-user-permission";
import { AccountUserPermissionList } from "./account-user-permission-list";

describe("AccountUserPermissionList", () => {
    const user = User.create({ externalId: "default", providerType: "local" });
    const account = Account.create({
        name: "default",
        createdBy: user,
        resources: { providerId: "default", providerType: "local" },
    });

    const listOf = (...names: Array<UserPermissionName>): AccountUserPermissionList => new AccountUserPermissionList({
        account,
        user,
        permissions: names.map(
            (name) => AccountUserPermission.create({ account, user, permission: new UserPermission(name) }),
        ),
    });

    describe(".intersect", () => {
        test("should return only the requested permissions that are held, preserving requested order", () => {
            const held = listOf(UserPermissionName.Environment.Create, UserPermissionName.Account.Read);

            const result = held.intersect([
                UserPermissionName.Environment.Delete,
                UserPermissionName.Account.Read,
                UserPermissionName.Environment.Create,
            ]);

            expect(result).toEqual([UserPermissionName.Account.Read, UserPermissionName.Environment.Create]);
        });

        test("should return an empty array when none of the requested permissions are held", () => {
            const held = listOf(UserPermissionName.Account.Read);

            expect(held.intersect([UserPermissionName.Environment.Delete])).toEqual([]);
        });
    });
});
