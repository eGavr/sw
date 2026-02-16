import { validate as isUuid, v4 as uuidv4 } from "uuid";

import { InvalidArgumentError } from "../error/invalid-argument-error";

import { UserId } from "./user-id";

describe("UserId", () => {
    describe("#create", () => {
        test("should create a new user id", () => {
            const id = UserId.create();

            expect(isUuid(id.getValue())).toBe(true);
        });
    });

    describe("#fromString", () => {
        test("should create a user id from input string", () => {
            const input = uuidv4();
            const output = UserId.fromString(input).getValue();

            expect(output).toBe(input);
        });

        test("should throw 'InvalidArgumentError' in case if invalid input string", () => {
            const fromString = (): UserId => UserId.fromString("<invalid-user-id>");

            expect(fromString).toThrow(InvalidArgumentError)
            expect(fromString).toThrow("user id: value must be a UUID");
        });
    });
});
