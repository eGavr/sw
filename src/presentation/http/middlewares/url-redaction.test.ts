import { redactUrl, UrlRedaction } from "./url-redaction";

describe("redactUrl", () => {
    const maskDigits: UrlRedaction = { pattern: /\d+/g, replacement: "#" };
    const maskToken: UrlRedaction = { pattern: /(token=)[^&]+/g, replacement: "$1<redacted>" };

    test("returns the url unchanged when there are no redactions", () => {
        expect(redactUrl("/a/b?token=secret", [])).toBe("/a/b?token=secret");
    });

    test("applies a redaction to every match", () => {
        expect(redactUrl("/a/1/b/2", [maskDigits])).toBe("/a/#/b/#");
    });

    test("applies every redaction in turn", () => {
        expect(redactUrl("/a/1?token=abc", [maskDigits, maskToken])).toBe("/a/#?token=<redacted>");
    });

    test("leaves a url untouched when nothing matches", () => {
        expect(redactUrl("/a/b/c", [maskDigits])).toBe("/a/b/c");
    });
});
