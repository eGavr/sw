import { v4 as uuidv4 } from "uuid";

import { InvalidArgumentError } from "../error/invalid-argument-error";
import { User } from "../user/user";

import { Account } from "./account";

describe("Account", () => {
    const createAcctountDefaults = {
        name: "default",
        createdBy: User.fromObject({ externalId: "default" }),
    };

    const accountDataDefaults = {
        id: uuidv4(),
        name: "default",
        createdBy: { externalId: "default" },
    };

    describe("#fromObject", () => {
        test("should throw 'InvalidArgumentError' in case of invalid id", () => {
            const accountFromObject = (): Account => Account.fromObject({ ...accountDataDefaults, id: "not-uuid" });

            expect(accountFromObject).toThrow(InvalidArgumentError);
            expect(accountFromObject).toThrow("account id: value must be a UUID");
        });
    });

    describe("#create", () => {
        test("should throw 'InvalidArgumentError' in case of invalid name", () => {
            const createAccount = (): Account => Account.create({ ...createAcctountDefaults, name: "<invalid-name>" });

            expect(createAccount).toThrow(InvalidArgumentError);
            expect(createAccount).toThrow(/account name: value must match .+ regular expression/);
        });

        test("should throw 'InvalidArgumentError' when name is longer than the limit values", () => {
            const createAccount = (): Account => Account.create({
                ...createAcctountDefaults,
                name: new Array(65).fill("a").join(""),
            });

            expect(createAccount).toThrow(InvalidArgumentError);
            expect(createAccount).toThrow("account name: value must be shorter than or equal to 64 characters");
        });
    });

    describe(".id (getter)", () => {
        test("should return an account id", () => {
            const accountId = uuidv4();
            const account = Account.fromObject({ ...accountDataDefaults, id: accountId });

            expect(account.id).toBe(accountId);
        });
    });

    describe(".name (getter)", () => {
        test("should return an account name", () => {
            const accountName = "awesome-account-name";
            const account = Account.create({ ...createAcctountDefaults, name: accountName });

            expect(account.name).toBe(accountName);
        });
    });
});
