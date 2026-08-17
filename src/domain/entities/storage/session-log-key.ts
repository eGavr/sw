// Where a session's logs live inside the project's storage destination, as a relative key under the
// destination prefix. Built from the environment id (a non-secret UUID) and the end timestamp — NEVER
// from the wire session id, which carries the secret WebDriver session id. The timestamp is stamped by
// the control-plane (not the agent) and is colon-free so it composes cleanly into an object key.
export class SessionLogKey {
    static forEnvironment(environmentId: string, endedAt: Date): string {
        const timestamp = endedAt.toISOString().replace(/[-:]/g, "");

        return `sessions/${environmentId}/${timestamp}/session.log`;
    }
}
