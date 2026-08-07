#!/usr/bin/env bash
# In-container heartbeat agent. The container cannot know its own published host port, so the
# orchestrator injects SW_ENDPOINT (the host-reachable address of this node). The first heartbeat
# carries that endpoint — it is the registration that flips the environment preparing -> executing;
# every later heartbeat keeps liveness fresh and reports whether the node currently holds a session.
#
# Self-fencing: if the backend replies 404 the environment is unknown to it (its row is gone), so this
# container is an orphan — it shuts the whole environment down. Any other failure (network, 5xx, a
# transient state conflict) is retried, so a brief backend blip never tears live environments down.
set -u

NODE_URL="${SW_NODE_URL:-http://localhost:4444}"
INTERVAL="${SW_HEARTBEAT_INTERVAL_SECONDS:-3}"

: "${SW_ENVIRONMENT_ID:?SW_ENVIRONMENT_ID is required}"
: "${SW_INTERNAL_URL:?SW_INTERNAL_URL is required}"
: "${SW_INTERNAL_SECRET:?SW_INTERNAL_SECRET is required}"
: "${SW_ENDPOINT:?SW_ENDPOINT is required}"

heartbeat_url="${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}:heartbeat"

log() { echo "[heartbeat-agent] $*"; }

node_ready() {
    curl -sf "${NODE_URL}/status" | jq -e '.value.ready == true' >/dev/null 2>&1
}

# busy = the node holds at least one active session. Recursive descent over the status document so
# it survives cosmetic changes to the Grid status shape; a failed fetch reads as not busy.
node_busy() {
    local count
    count=$(curl -sf "${NODE_URL}/status" \
        | jq '[.. | objects | select(has("session")) | .session | select(. != null)] | length' 2>/dev/null)
    if [ "${count:-0}" -gt 0 ]; then echo true; else echo false; fi
}

# POST a heartbeat and echo the HTTP status code (000 if the backend was unreachable).
send_heartbeat() {
    curl -s -o /dev/null -w "%{http_code}" -X POST "${heartbeat_url}" \
        -H "content-type: application/json" \
        -H "x-internal-secret: ${SW_INTERNAL_SECRET}" \
        -d "$1"
}

# Bring the whole environment down: stop supervisord (PID 1) as the base image itself does on shutdown,
# and let `docker run --rm` remove the container. No control-plane cleanup is needed.
shutdown_environment() {
    log "backend has no record of this environment; shutting the environment down"
    kill -s SIGINT "$(cat /var/run/supervisor/supervisord.pid)" 2>/dev/null || kill -s SIGTERM 1
    exit 0
}

# Report once: succeed on 2xx, self-destruct if the backend does not know this environment (404),
# retry (return non-zero) on anything else.
report() {
    local code
    code=$(send_heartbeat "$1")

    case "${code}" in
        2*) return 0 ;;
        404) shutdown_environment ;;
        *) log "heartbeat failed (${code}); retrying"; return 1 ;;
    esac
}

log "waiting for the browser node at ${NODE_URL} to become ready"
until node_ready; do sleep 1; done
log "node ready; registering environment ${SW_ENVIRONMENT_ID} at ${SW_ENDPOINT}"

until report "{\"endpoint\":\"${SW_ENDPOINT}\",\"busy\":$(node_busy)}"; do
    sleep "${INTERVAL}"
done
log "registered"

while true; do
    sleep "${INTERVAL}"
    report "{\"busy\":$(node_busy)}" || true
done
