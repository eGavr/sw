import { SessionRoute } from "../session-route";

import { resolveWebSocketUpgrade } from "./websocket-proxy";

describe("resolveWebSocketUpgrade", () => {
    const id = SessionRoute.encode("http://127.0.0.1:32773", "wd-session-1");

    test("maps a bidi upgrade path to the upstream ws URL, keeping the route parts", () => {
        expect(resolveWebSocketUpgrade(`/sessions/${id}/se/bidi`)).toEqual({
            endpoint: "http://127.0.0.1:32773",
            webDriverSessionId: "wd-session-1",
            target: "ws://127.0.0.1:32773/session/wd-session-1/se/bidi",
        });
    });

    test("keeps the sub-path (cdp/vnc) intact", () => {
        expect(resolveWebSocketUpgrade(`/sessions/${id}/se/cdp`)?.target)
            .toBe("ws://127.0.0.1:32773/session/wd-session-1/se/cdp");
    });

    test("upgrades https endpoints to wss", () => {
        const secure = SessionRoute.encode("https://node.example:4444", "wd-session-2");

        expect(resolveWebSocketUpgrade(`/sessions/${secure}/se/vnc`)?.target)
            .toBe("wss://node.example:4444/session/wd-session-2/se/vnc");
    });

    test("returns null for a path without a sub-path", () => {
        expect(resolveWebSocketUpgrade(`/sessions/${id}`)).toBeNull();
    });

    test("returns null for a non-session path", () => {
        expect(resolveWebSocketUpgrade("/health")).toBeNull();
    });

    test("returns null for a malformed session id", () => {
        expect(resolveWebSocketUpgrade("/sessions/not-a-valid-id/se/bidi")).toBeNull();
    });
});
