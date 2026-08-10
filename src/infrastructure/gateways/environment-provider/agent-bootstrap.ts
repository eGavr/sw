export const defaultAgentEntrypoint = "/opt/bin/entry_point.sh";

// Command run inside a stock selenium container: fetch the heartbeat agent from the control plane (with
// the injected secret) and run it in the background, then exec the image's normal entrypoint so it
// becomes PID 1 with proper signal handling. The agent is delivered at startup rather than baked into
// the image, so any stock browser image/version works with no rebuild. Retries a few times because the
// control plane may not be reachable the instant the container starts.
export function agentBootstrap(entrypoint: string): string {
    return [
        "for attempt in 1 2 3 4 5; do",
        "  curl -fsSL -H \"x-internal-secret: $SW_INTERNAL_SECRET\""
            + " \"$SW_INTERNAL_URL/internal/agentScript:download\" -o /tmp/sw-agent.sh && break",
        "  sleep 2",
        "done",
        "bash /tmp/sw-agent.sh &",
        `exec ${entrypoint}`,
    ].join("\n");
}
