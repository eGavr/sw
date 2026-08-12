export const defaultAgentEntrypoint = "/opt/bin/entry_point.sh";

// Where the container's combined stdout/stderr is redirected so the agent can slice a session's logs out
// of it. Stock selenium images write node/session logs to stdout (not a file), so the entrypoint's output
// is redirected here; the agent reads this file (via SW_SESSION_LOG_GLOB). Injected into the pod env by
// the compute gateways so the two stay in sync.
export const sessionLogFile = "/tmp/sw-session.log";

// Command run inside a stock selenium container: fetch the heartbeat agent from the control plane (with
// the injected secret) and run it in the background, then exec the image's normal entrypoint so it
// becomes PID 1 with proper signal handling. The agent is delivered at startup rather than baked into
// the image, so any stock browser image/version works with no rebuild. Retries a few times because the
// control plane may not be reachable the instant the container starts.
//
// The entrypoint's stdout/stderr are redirected to `sessionLogFile` (so the agent can capture session
// logs, which stock images send to stdout) while a background `tail -F` mirrors them to the container's
// real stdout so `docker/kubectl logs` still work. `exec` keeps the entrypoint as PID 1, so its fd 1 is
// the file and supervisord's `/dev/stdout` programs land there too; the agent and tail were forked before
// the exec, so their stdout stays the container's original stdout.
export function agentBootstrap(entrypoint: string): string {
    return [
        "for attempt in 1 2 3 4 5; do",
        "  curl -fsSL -H \"x-internal-secret: $SW_INTERNAL_SECRET\""
            + " \"$SW_INTERNAL_URL/internal/agentScript:download\" -o /tmp/sw-agent.sh && break",
        "  sleep 2",
        "done",
        "bash /tmp/sw-agent.sh &",
        `touch ${sessionLogFile}`,
        `tail -n +1 -F ${sessionLogFile} 2>/dev/null &`,
        `exec ${entrypoint} >>${sessionLogFile} 2>&1`,
    ].join("\n");
}
