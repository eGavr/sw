// A redaction applied to a request URL before it is logged: `pattern` matches a secret-bearing segment
// and `replacement` masks it. The logging middleware applies every redaction it is given, so the module
// that owns a sensitive route declares its own redaction (registered under URL_REDACTIONS) instead of the
// shared middleware hardcoding which segment of which path is secret.
export type UrlRedaction = {
    pattern: RegExp;
    replacement: string;
};

// DI token for the redactions the logging middleware applies. Each delivery module provides the redactions
// of its own sensitive routes; a module with none provides nothing (the middleware defaults to []).
export const UrlRedactions = Symbol("UrlRedactions");

export function redactUrl(url: string, redactions: ReadonlyArray<UrlRedaction>): string {
    return redactions.reduce((redacted, { pattern, replacement }) => redacted.replace(pattern, replacement), url);
}
