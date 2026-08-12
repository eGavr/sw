// Where a session's video recording lives inside the account's storage destination, as a relative key
// under the destination prefix. Built from the environment id (a non-secret UUID) and the end timestamp —
// NEVER from the wire session id, which carries the secret WebDriver session id. The timestamp is stamped
// by the control-plane (not the agent) and is colon-free so it composes cleanly into an object key. Sits
// beside SessionLogKey; both name a session artifact under the same sessions/<env>/<ts>/ folder.
export class SessionVideoKey {
    static forEnvironment(environmentId: string, endedAt: Date): string {
        const timestamp = endedAt.toISOString().replace(/[-:]/g, "");

        return `sessions/${environmentId}/${timestamp}/session.mp4`;
    }
}
