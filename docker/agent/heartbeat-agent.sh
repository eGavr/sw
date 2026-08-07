#!/usr/bin/env bash
# In-container heartbeat agent. The container cannot know its own published host port, so the
# orchestrator injects SW_ENDPOINT (the host-reachable address of this node). The first heartbeat
# carries that endpoint — it is the registration that flips the environment preparing -> executing;
# every later heartbeat keeps liveness fresh and reports whether the node currently holds a session.
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

send_heartbeat() {
    curl -sf -o /dev/null -X POST "${heartbeat_url}" \
        -H "content-type: application/json" \
        -H "x-internal-secret: ${SW_INTERNAL_SECRET}" \
        -d "$1"
}

log "waiting for the browser node at ${NODE_URL} to become ready"
until node_ready; do sleep 1; done
log "node ready; registering environment ${SW_ENVIRONMENT_ID} at ${SW_ENDPOINT}"

until send_heartbeat "{\"endpoint\":\"${SW_ENDPOINT}\",\"busy\":$(node_busy)}"; do
    log "registration heartbeat failed; retrying in ${INTERVAL}s"
    sleep "${INTERVAL}"
done
log "registered"

while true; do
    sleep "${INTERVAL}"
    send_heartbeat "{\"busy\":$(node_busy)}" || log "heartbeat failed"
done
