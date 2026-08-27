import { createHash } from "node:crypto";

// Where a session's logs live inside the project's storage destination, as a relative key under the
// destination prefix. Built from a NON-secret fingerprint of the WebDriver session id — sha256 — so the
// wire session id (which carries the secret wdSessionId) never appears in an object key that outlives the
// session and shows up in bucket listings/audit. The same key is computed on write (from the id the agent
// read off the node) and on read (from the id decoded out of the caller's session id), so a log is
// addressable by session without storing the secret. sha256 matches the agent's `sha256sum`.
export class SessionLogKey {
    static forSession(webDriverSessionId: string): string {
        const fingerprint = createHash("sha256").update(webDriverSessionId).digest("hex");

        return `session-logs/${fingerprint}/session.log`;
    }
}
