import { InvalidArgumentError } from "../error/invalid-argument-error";

import { UserPermissionName } from "./user-permission-name";

describe("UserPermissionName", () => {
    describe("#fromString", () => {
        test("should return the permission name for a known value", () => {
            expect(UserPermissionName.fromString("sw.environments.create")).toBe(UserPermissionName.Environment.Create);
        });

        test("should throw 'InvalidArgumentError' for an unknown permission", () => {
            const fromString = (): UserPermissionName => UserPermissionName.fromString("sw.environments.teleport");

            expect(fromString).toThrow(InvalidArgumentError);
            expect(fromString).toThrow("unknown permission: sw.environments.teleport");
        });
    });
});
