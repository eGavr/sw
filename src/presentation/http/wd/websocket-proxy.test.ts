import { SessionRoute } from "./session-route";
import { resolveWebSocketTarget } from "./websocket-proxy";

describe("resolveWebSocketTarget", () => {
    const id = SessionRoute.encode("http://127.0.0.1:32773", "wd-session-1");

    test("maps a bidi upgrade path to the upstream ws URL", () => {
        expect(resolveWebSocketTarget(`/sessions/${id}/se/bidi`))
            .toBe("ws://127.0.0.1:32773/session/wd-session-1/se/bidi");
    });

    test("keeps the sub-path (cdp/vnc) intact", () => {
        expect(resolveWebSocketTarget(`/sessions/${id}/se/cdp`))
            .toBe("ws://127.0.0.1:32773/session/wd-session-1/se/cdp");
    });

    test("upgrades https endpoints to wss", () => {
        const secure = SessionRoute.encode("https://node.example:4444", "wd-session-2");

        expect(resolveWebSocketTarget(`/sessions/${secure}/se/vnc`))
            .toBe("wss://node.example:4444/session/wd-session-2/se/vnc");
    });

    test("returns null for a path without a sub-path", () => {
        expect(resolveWebSocketTarget(`/sessions/${id}`)).toBeNull();
    });

    test("returns null for a non-session path", () => {
        expect(resolveWebSocketTarget("/health")).toBeNull();
    });

    test("returns null for a malformed session id", () => {
        expect(resolveWebSocketTarget("/sessions/not-a-valid-id/se/bidi")).toBeNull();
    });
});
