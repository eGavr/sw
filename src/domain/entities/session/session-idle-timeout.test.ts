import { InvalidArgumentError } from "../error/invalid-argument-error";

import { defaultSessionIdleTimeoutSeconds, SessionIdleTimeout } from "./session-idle-timeout";

describe("SessionIdleTimeout", () => {
    test("defaults to the domain policy", () => {
        expect(SessionIdleTimeout.default().toSeconds()).toBe(defaultSessionIdleTimeoutSeconds);
    });

    test("accepts a positive integer of seconds", () => {
        expect(SessionIdleTimeout.ofSeconds(120).toSeconds()).toBe(120);
    });

    test("rejects a non-positive timeout", () => {
        expect(() => SessionIdleTimeout.ofSeconds(0)).toThrow(InvalidArgumentError);
        expect(() => SessionIdleTimeout.ofSeconds(-5)).toThrow(InvalidArgumentError);
    });

    test("rejects a non-integer timeout", () => {
        expect(() => SessionIdleTimeout.ofSeconds(1.5)).toThrow(InvalidArgumentError);
        expect(() => SessionIdleTimeout.ofSeconds(Number.NaN)).toThrow(InvalidArgumentError);
    });
});
