import { createHash } from "node:crypto";

// Where a session's video recording lives inside the project's storage destination — a flat key under the
// destination prefix, fingerprinted from the WebDriver session id (sha256), exactly like SessionLogKey.
// The raw session secret never lands in a persistent object key, and the same key is computed on write
// (from the id the agent read off the node) and on read (from the id decoded out of the caller's session
// id), so the recording is addressable by session without storing the secret. sha256 matches `sha256sum`.
export class SessionVideoKey {
    static forSession(webDriverSessionId: string): string {
        const fingerprint = createHash("sha256").update(webDriverSessionId).digest("hex");

        return `session-videos/${fingerprint}/session.mp4`;
    }
}
