import { redactUrl } from "./middlewares/url-redaction";
import { sessionIdUrlRedaction } from "./session-route-redaction";

const redact = (url: string): string => redactUrl(url, [sessionIdUrlRedaction]);

describe("sessionIdUrlRedaction", () => {
    test("masks the id of a WebDriver command path", () => {
        expect(redact("/sessions/AbC-123_x/url")).toBe("/sessions/<redacted>/url");
    });

    test("masks the id of a bare session path (teardown)", () => {
        expect(redact("/sessions/AbC-123_x")).toBe("/sessions/<redacted>");
    });

    test("masks the id before a custom verb, keeping the verb", () => {
        expect(redact("/internal/environments/e1/sessions/deadbeef:uploadSessionLogs"))
            .toBe("/internal/environments/e1/sessions/<redacted>:uploadSessionLogs");
    });

    test("masks the id in a nested api path, keeping the query", () => {
        expect(redact("/v1/projects/p1/sessions/AbC123/logs?pageSize=1"))
            .toBe("/v1/projects/p1/sessions/<redacted>/logs?pageSize=1");
    });

    test("masks the id of a websocket protocol path", () => {
        expect(redact("/sessions/AbC123/se/vnc")).toBe("/sessions/<redacted>/se/vnc");
    });

    test("leaves a path without a session id untouched", () => {
        expect(redact("/v1/projects/p1/environments/e1")).toBe("/v1/projects/p1/environments/e1");
    });
});
