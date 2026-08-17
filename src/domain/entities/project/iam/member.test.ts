import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Member } from "./member";

describe("Member", () => {
    test("formats a user member", () => {
        expect(Member.user("alice").getValue()).toBe("user:alice");
    });

    test("parses a user member back to an equal value", () => {
        expect(Member.fromString("user:alice").equals(Member.user("alice"))).toBe(true);
    });

    test("rejects a member without the user prefix", () => {
        expect(() => Member.fromString("alice")).toThrow(InvalidArgumentError);
    });

    test("rejects an empty user id", () => {
        expect(() => Member.fromString("user:")).toThrow(InvalidArgumentError);
    });
});
