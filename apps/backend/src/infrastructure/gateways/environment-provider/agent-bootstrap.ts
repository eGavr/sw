// The linux base image's bootstrap: fetches the node script from the control plane and hands over.
export const linuxNodeEntrypoint = "/opt/sw/bootstrap.sh";

// Where the container's combined stdout/stderr is redirected so the agent can slice a session's logs out
// of it; the agent reads this file (via SW_SESSION_LOG_GLOB). Injected into the container env by the
// compute gateways so the two stay in sync.
export const sessionLogFile = "/tmp/sw-session.log";

// Command run inside a node container: fetch the heartbeat agent from the control plane (with the
// injected per-environment token) and run it in the background, then exec the image's bootstrap so it
// becomes PID 1 with proper signal handling. The agent is delivered at startup rather than baked into
// the image, so an image change is never needed for an agent change. Retries a few times because the
// control plane may not be reachable the instant the container starts.
//
// The bootstrap's stdout/stderr are redirected to `sessionLogFile` (so the agent can capture session
// logs) while a background `tail -F` mirrors them to the container's real stdout so `docker/kubectl
// logs` still work. `exec` keeps the bootstrap as PID 1, so its fd 1 is the file and everything it
// starts lands there too; the agent and tail were forked before the exec, so their stdout stays the
// container's original stdout.
export function agentBootstrap(entrypoint: string): string {
    return [
        "for attempt in 1 2 3 4 5; do",
        "  curl -fsSL -H \"Authorization: Bearer $SW_INTERNAL_TOKEN\""
            + " \"$SW_INTERNAL_URL/internal/agentScript:download\" -o /tmp/sw-agent.sh && break",
        "  sleep 2",
        "done",
        "bash /tmp/sw-agent.sh &",
        `touch ${sessionLogFile}`,
        `tail -n +1 -F ${sessionLogFile} 2>/dev/null &`,
        `exec ${entrypoint} >>${sessionLogFile} 2>&1`,
    ].join("\n");
}
