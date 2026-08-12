#!/usr/bin/env bash
# In-container heartbeat agent. The container cannot know its own published host port, so the
# orchestrator injects SW_ENDPOINT (the host-reachable address of this node). The first heartbeat
# carries that endpoint — it is the registration that flips the environment preparing -> executing;
# every later heartbeat keeps liveness fresh and reports whether the node currently holds a session.
#
# On session end the agent also ships that session's logs to the control-plane, which uploads them to
# the user's storage (the agent holds no cloud credentials). Logging is opt-in per session via the
# sw:logging capability; the upload is best effort and never brings the environment down.
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
session_logs_url="${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}:uploadSessionLogs"

# The startup bootstrap redirects the container's whole stdout/stderr into one file (stock selenium logs
# to stdout, not a per-session file), so a session's logs are the slice appended between its start and
# end. Capped to the last max_log_bytes (session end + errors) if larger.
session_log_glob="${SW_SESSION_LOG_GLOB:-/tmp/sw-session.log}"
max_log_bytes="${SW_MAX_LOG_BYTES:-10485760}"

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

# Whether the current session opted into logging, read from the sw:logging vendor capability on the
# active node session. If the node status does not expose session capabilities this reads false (the
# fallback — a pod-local proxy that parses session creation — is tracked separately in the plan).
session_wants_logs() {
    curl -sf "${NODE_URL}/status" \
        | jq -e 'first(.. | objects | select(has("session")) | .session | select(. != null))
                 | .capabilities["sw:logging"] == true' >/dev/null 2>&1
}

# Total bytes currently in the node log files (0 if none exist yet). The glob is intentionally unquoted
# so the shell expands it; a non-matching glob reads as 0 bytes.
log_size() {
    cat ${session_log_glob} 2>/dev/null | wc -c | tr -d '[:space:]'
}

# Ship the bytes appended since start_offset (this session's slice) to the control-plane. Best effort:
# any non-2xx is logged and ignored — it must never bring the environment down (only heartbeat 404 does).
ship_session_logs() {
    local start_offset="$1" total available tail_start code
    total=$(log_size)

    if [ "${total:-0}" -le "${start_offset}" ]; then
        return 0
    fi

    available=$((total - start_offset))
    tail_start=$((start_offset + 1))
    if [ "${available}" -gt "${max_log_bytes}" ]; then
        tail_start=$((total - max_log_bytes + 1))
    fi

    code=$(cat ${session_log_glob} 2>/dev/null | tail -c "+${tail_start}" \
        | curl -s -o /dev/null -w "%{http_code}" -X POST "${session_logs_url}" \
            -H "x-internal-secret: ${SW_INTERNAL_SECRET}" \
            -H "content-type: application/octet-stream" \
            --max-time 20 --data-binary @-)

    case "${code}" in
        2*) log "shipped session logs (${available} bytes)" ;;
        *) log "session log upload failed (${code}); dropping" ;;
    esac
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

# Heartbeat loop, tracking session start/end transitions to capture and ship the session's logs.
# `idle_offset` is the log size at the last idle tick; a session's slice starts there (not at the tick
# that first saw it busy) so the session's own opening lines aren't missed.
prev_busy=false
capture=false
idle_offset=0
log_offset=0

while true; do
    sleep "${INTERVAL}"

    busy=$(node_busy)
    report "{\"busy\":${busy}}" || true

    if [ "${busy}" = "true" ] && [ "${prev_busy}" = "false" ]; then
        if session_wants_logs; then capture=true; else capture=false; fi
        log_offset="${idle_offset}"
    elif [ "${busy}" = "false" ] && [ "${prev_busy}" = "true" ]; then
        if [ "${capture}" = "true" ]; then ship_session_logs "${log_offset}"; fi
        capture=false
    fi

    if [ "${busy}" = "false" ]; then idle_offset=$(log_size); fi

    prev_busy="${busy}"
done
