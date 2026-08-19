// A session id is a capability secret — it encodes the WebDriver session id — so it must never reach our
// logs. Mask the id segment of any `/sessions/<id>...` path (WebDriver commands and proxy routes on wd,
// log read on api, log upload on internal), keeping the surrounding path for diagnostics. The id runs to
// the next `/`, `:` (custom verb) or `?` (query), so those and everything after are preserved.
export function redactSessionIds(url: string): string {
    return url.replace(/(\/sessions\/)[^/?:]+/g, "$1<redacted>");
}
