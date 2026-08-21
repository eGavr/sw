import { UrlRedaction } from "./middlewares/url-redaction";

// A session id encodes the WebDriver session id (a capability secret), so it must never reach our logs.
// This masks the id segment of any `/sessions/<id>...` path — WebDriver commands and proxy routes on wd,
// log/video read on api, log/video upload on internal. The id runs to the next `/`, `:` (custom verb) or
// `?` (query), so those and everything after are kept for diagnostics. The route that carries a session id
// declares this redaction with the logging middleware, so the middleware itself stays route-agnostic.
export const sessionIdUrlRedaction: UrlRedaction = {
    pattern: /(\/sessions\/)[^/?:]+/g,
    replacement: "$1<redacted>",
};
