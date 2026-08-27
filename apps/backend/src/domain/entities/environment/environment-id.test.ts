import { validate as isUuid, v4 as uuidv4 } from "uuid";

import { InvalidArgumentError } from "../error/invalid-argument-error";

import { EnvironmentId } from "./environment-id";

describe("EnvironmentId", () => {
    describe("#create", () => {
        test("should create a new environment id", () => {
            const id = EnvironmentId.create();

            expect(isUuid(id.getValue())).toBe(true);
        });
    });

    describe("#fromString", () => {
        test("should create an environment id from input string", () => {
            const input = uuidv4();
            const output = EnvironmentId.fromString(input).getValue();

            expect(output).toBe(input);
        });

        test("should throw 'InvalidArgumentError' in case if invalid input string", () => {
            const fromString = (): EnvironmentId => EnvironmentId.fromString("<invalid-environment-id>");

            expect(fromString).toThrow(InvalidArgumentError)
            expect(fromString).toThrow("environment id: value must be a UUID");
        });
    });
});
