import { SessionVideoKey } from "./session-video-key";

describe("SessionVideoKey", () => {
    describe("#forSession", () => {
        // sha256("abc") — the digest `sha256sum` produces in the agent container, locking the key contract.
        const sha256OfAbc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

        test("keys a recording by the sha256 fingerprint of the session id", () => {
            expect(SessionVideoKey.forSession("abc")).toBe(`session-videos/${sha256OfAbc}/session.mp4`);
        });

        test("is deterministic and never leaks the raw session id", () => {
            const key = SessionVideoKey.forSession("wd-session-secret-123");

            expect(key).toBe(SessionVideoKey.forSession("wd-session-secret-123"));
            expect(key).not.toContain("wd-session-secret-123");
        });
    });
});
