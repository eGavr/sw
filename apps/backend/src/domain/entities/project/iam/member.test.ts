import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Member } from "./member";

describe("Member", () => {
    test("formats a user member", () => {
        expect(Member.user("alice").getValue()).toBe("user:alice");
    });

    test("parses a user member back to an equal value", () => {
        expect(Member.fromString("user:alice").equals(Member.user("alice"))).toBe(true);
    });

    test("formats a group member", () => {
        expect(Member.group("eng").getValue()).toBe("group:eng");
    });

    test("parses a group member back to an equal value", () => {
        expect(Member.fromString("group:eng").equals(Member.group("eng"))).toBe(true);
    });

    test("rejects a member without a known prefix", () => {
        expect(() => Member.fromString("alice")).toThrow(InvalidArgumentError);
    });

    test("rejects an empty user id", () => {
        expect(() => Member.fromString("user:")).toThrow(InvalidArgumentError);
    });

    test("rejects an empty group id", () => {
        expect(() => Member.fromString("group:")).toThrow(InvalidArgumentError);
    });
});
