import { InvalidArgumentError } from "../../error/invalid-argument-error";
import { UserPermissionName } from "../../user/user-permission-name";

import { Role, RoleName } from "./role";

describe("Role", () => {
    test("admin holds every permission", () => {
        const permissions = Role.fromName("roles/admin").permissions();

        expect(permissions.has(UserPermissionName.Account.SetIamPolicy)).toBe(true);
        expect(permissions.has(UserPermissionName.Environment.Create)).toBe(true);
    });

    test("viewer holds only read permissions", () => {
        const permissions = Role.fromName(RoleName.Viewer).permissions();

        expect(permissions.has(UserPermissionName.Environment.Read)).toBe(true);
        expect(permissions.has(UserPermissionName.Environment.Create)).toBe(false);
        expect(permissions.has(UserPermissionName.Account.SetIamPolicy)).toBe(false);
    });

    test("permissionsOf unions the permissions of several roles", () => {
        const permissions = Role.permissionsOf([RoleName.Viewer, RoleName.Developer]);

        expect(permissions.has(UserPermissionName.Environment.Create)).toBe(true);
        expect(permissions.has(UserPermissionName.Environment.Read)).toBe(true);
    });

    test("rejects an unknown role", () => {
        expect(() => Role.fromName("roles/wizard")).toThrow(InvalidArgumentError);
    });
});
