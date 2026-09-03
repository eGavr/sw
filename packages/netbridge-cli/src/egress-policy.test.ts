import { EgressPolicy } from "./egress-policy";

describe("EgressPolicy", () => {
    test("allows loopback — reaching the user's localhost is the point", () => {
        expect(new EgressPolicy().allows("127.0.0.1")).toBe(true);
        expect(new EgressPolicy().allows("localhost")).toBe(true);
    });

    test("allows an ordinary private or public host by default", () => {
        expect(new EgressPolicy().allows("192.168.1.10")).toBe(true);
        expect(new EgressPolicy().allows("api.internal.example.com")).toBe(true);
    });

    test("denies link-local and cloud metadata by default", () => {
        expect(new EgressPolicy().allows("169.254.169.254")).toBe(false);
        expect(new EgressPolicy().allows("fe80::1")).toBe(false);
    });

    test("an allowlist permits only its hosts (but link-local stays denied)", () => {
        const policy = new EgressPolicy({ allow: ["localhost", "db.internal"] });

        expect(policy.allows("localhost")).toBe(true);
        expect(policy.allows("db.internal")).toBe(true);
        expect(policy.allows("evil.example.com")).toBe(false);
        expect(policy.allows("169.254.169.254")).toBe(false);
    });
});
