import { InvalidArgumentError } from "../error/invalid-argument-error";

import { AccountName } from "./account-name";

describe("AccountName", () => {
    describe(".constructor", () => {
        test("should throw when account name contains special symbols", () => {
            const nameWithSpecialSymbols = (): AccountName => new AccountName("???");

            expect(nameWithSpecialSymbols).toThrow(InvalidArgumentError);
            expect(nameWithSpecialSymbols).toThrow(/account name: value must match .+ regular expression/);
        });

        test("should throw when account name contains non-latin symbols", () => {
            const nameWithSpecialSymbols = (): AccountName => new AccountName("какое-то название");

            expect(nameWithSpecialSymbols).toThrow(InvalidArgumentError);
            expect(nameWithSpecialSymbols).toThrow(/account name: value must match .+ regular expression/);
        });

        test("should throw when account name is longer than the limit values", () => {
            const nameWithSpecialSymbols = (): AccountName => new AccountName(new Array(65).fill("w").join(""));

            expect(nameWithSpecialSymbols).toThrow(InvalidArgumentError);
            expect(nameWithSpecialSymbols).toThrow("account name: value must be shorter than or equal to 64 characters");
        });
    });

    describe(".getValue", () => {
        test("should return account name", () => {
            const name = "AwEsOmE-account-NAME-100500";
            const accountName = new AccountName(name);

            expect(accountName.getValue()).toBe(name);
        });
    });
});
