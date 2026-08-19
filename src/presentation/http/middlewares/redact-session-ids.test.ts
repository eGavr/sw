import { redactSessionIds } from "./redact-session-ids";

describe("redactSessionIds", () => {
    test("masks the id of a WebDriver command path", () => {
        expect(redactSessionIds("/sessions/AbC-123_x/url")).toBe("/sessions/<redacted>/url");
    });

    test("masks the id of a bare session path (teardown)", () => {
        expect(redactSessionIds("/sessions/AbC-123_x")).toBe("/sessions/<redacted>");
    });

    test("masks the id before a custom verb, keeping the verb", () => {
        expect(redactSessionIds("/internal/environments/e1/sessions/deadbeef:uploadSessionLogs"))
            .toBe("/internal/environments/e1/sessions/<redacted>:uploadSessionLogs");
    });

    test("masks the id in a nested api path, keeping the query", () => {
        expect(redactSessionIds("/v1/projects/p1/sessions/AbC123/logs?pageSize=1"))
            .toBe("/v1/projects/p1/sessions/<redacted>/logs?pageSize=1");
    });

    test("masks the id of a websocket protocol path", () => {
        expect(redactSessionIds("/sessions/AbC123/se/vnc")).toBe("/sessions/<redacted>/se/vnc");
    });

    test("leaves a path without a session id untouched", () => {
        expect(redactSessionIds("/v1/projects/p1/environments/e1")).toBe("/v1/projects/p1/environments/e1");
    });
});
