import { SessionRoute } from "./session-route";

describe("SessionRoute", () => {
    test("should round-trip the endpoint and webdriver session id", () => {
        const token = SessionRoute.encode("http://127.0.0.1:32769", "abc123def456");

        expect(token).not.toContain("/");
        expect(SessionRoute.decode(token)).toEqual({
            endpoint: "http://127.0.0.1:32769",
            webDriverSessionId: "abc123def456",
        });
    });

    test("should return null when the token has no separator", () => {
        expect(SessionRoute.decode("no-separator-here")).toBeNull();
    });
});
