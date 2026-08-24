import { InvalidArgumentError } from "../../entities/error/invalid-argument-error";

import { ResourceId } from "./resource-id";

describe("ResourceId", () => {
    test.each(["a", "my-team", "chrome-stable-141", "x0"])("accepts %s", (value) => {
        expect(new ResourceId(value).getValue()).toBe(value);
    });

    test.each([
        ["", "empty"],
        ["My-Team", "uppercase"],
        ["1team", "leading digit"],
        ["-team", "leading hyphen"],
        ["team_a", "underscore"],
        ["a".repeat(64), "too long"],
        ["3f2504e0-4f89-41d3-9a0c-0305e82c3301", "uuid-shaped"],
    ])("rejects %s (%s)", (value) => {
        expect(() => new ResourceId(value)).toThrow(InvalidArgumentError);
    });
});
