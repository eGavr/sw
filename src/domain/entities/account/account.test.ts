import { v4 as uuidv4 } from "uuid";

import { InvalidArgumentError } from "../error/invalid-argument-error";
import { User } from "../user/user";
import { UserPermissionName } from "../user/user-permission-name";

import { Account, AccountData } from "./account";
import { IamBinding } from "./iam/iam-binding";
import { IamPolicy } from "./iam/iam-policy";
import { Member } from "./iam/member";
import { RoleName } from "./iam/role";

describe("Account", () => {
    const createDefaults = {
        name: "default",
        createdBy: User.create({ externalId: "alice", providerType: "local" }),
    };

    const accountData = (overrides: Partial<AccountData> = {}): AccountData => ({
        id: uuidv4(),
        name: "default",
        createdAt: new Date(0),
        createdBy: { id: uuidv4(), externalId: "alice", providerType: "local", createdAt: new Date(0), updatedAt: new Date(0) },
        updatedAt: new Date(0),
        bindings: [],
        ...overrides,
    });

    describe("#fromObject", () => {
        test("should throw InvalidArgumentError for an invalid id", () => {
            const fromObject = (): Account => Account.fromObject(accountData({ id: "not-uuid" }));

            expect(fromObject).toThrow(InvalidArgumentError);
            expect(fromObject).toThrow("account id: value must be a UUID");
        });

        test("should reconstitute the policy from bindings", () => {
            const account = Account.fromObject(accountData({ bindings: [{ role: "roles/viewer", members: ["user:bob"] }] }));

            expect(account.grants(Member.user("bob"), UserPermissionName.Environment.Read)).toBe(true);
            expect(account.grants(Member.user("bob"), UserPermissionName.Environment.Create)).toBe(false);
        });
    });

    describe("#create", () => {
        test("should throw InvalidArgumentError for an invalid name", () => {
            const createAccount = (): Account => Account.create({ ...createDefaults, name: "<invalid-name>" });

            expect(createAccount).toThrow(InvalidArgumentError);
            expect(createAccount).toThrow(/account name: value must match .+ regular expression/);
        });

        test("should throw InvalidArgumentError when name exceeds the limit", () => {
            const createAccount = (): Account => Account.create({ ...createDefaults, name: new Array(65).fill("a").join("") });

            expect(createAccount).toThrow(InvalidArgumentError);
            expect(createAccount).toThrow("account name: value must be shorter than or equal to 64 characters");
        });

        test("should grant the creator the admin role (every permission)", () => {
            const account = Account.create(createDefaults);
            const owner = Member.user("alice");

            expect(account.grants(owner, UserPermissionName.Environment.Create)).toBe(true);
            expect(account.grants(owner, UserPermissionName.Account.SetIamPolicy)).toBe(true);
        });
    });

    describe("#grants / #testPermissions", () => {
        test("should deny a non-member and report no held permissions", () => {
            const account = Account.create(createDefaults);
            const stranger = Member.user("mallory");

            expect(account.grants(stranger, UserPermissionName.Environment.Read)).toBe(false);
            expect(account.testPermissions(stranger, [UserPermissionName.Account.Read])).toEqual([]);
        });
    });

    describe("#setIamPolicy", () => {
        test("should replace the whole policy", () => {
            const account = Account.create(createDefaults);

            account.setIamPolicy(IamPolicy.fromBindings([IamBinding.create(RoleName.Developer, [Member.user("bob")])]));

            expect(account.grants(Member.user("alice"), UserPermissionName.Account.SetIamPolicy)).toBe(false);
            expect(account.grants(Member.user("bob"), UserPermissionName.Environment.Create)).toBe(true);
        });
    });

    describe(".id / .name getters", () => {
        test("should return the id and name", () => {
            const id = uuidv4();
            const account = Account.fromObject(accountData({ id, name: "team-a" }));

            expect(account.id).toBe(id);
            expect(account.name).toBe("team-a");
        });
    });
});
