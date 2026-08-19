import { SessionLogKey } from "./session-log-key";

describe("SessionLogKey", () => {
    describe("#forSession", () => {
        // sha256("abc") — the exact digest `sha256sum` produces in the agent container, locking the
        // write/read key contract to the agent's hash.
        const sha256OfAbc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

        test("keys a log by the sha256 fingerprint of the session id", () => {
            expect(SessionLogKey.forSession("abc")).toBe(`session-logs/${sha256OfAbc}/session.log`);
        });

        test("is deterministic and never leaks the raw session id", () => {
            const key = SessionLogKey.forSession("wd-session-secret-123");

            expect(key).toBe(SessionLogKey.forSession("wd-session-secret-123"));
            expect(key).not.toContain("wd-session-secret-123");
        });

        test("distinguishes different sessions", () => {
            expect(SessionLogKey.forSession("session-a")).not.toBe(SessionLogKey.forSession("session-b"));
        });
    });
});
