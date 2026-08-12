#!/usr/bin/env bash
# In-container heartbeat agent. The container cannot know its own published host port, so the
# orchestrator injects SW_ENDPOINT (the host-reachable address of this node). The first heartbeat
# carries that endpoint — it is the registration that flips the environment preparing -> executing;
# every later heartbeat keeps liveness fresh and reports whether the node currently holds a session.
#
# On session end the agent also ships that session's logs and, if it recorded one, its video to the
# control-plane, which uploads them to the user's storage (the agent holds no cloud credentials). Both are
# opt-in per session via the sw:logging / sw:video capabilities; the uploads are best effort and never
# bring the environment down. Video is recorded in-container by a static ffmpeg (fetched from the control
# plane at startup, no image rebuild) grabbing the X display the browser renders on.
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
session_video_url="${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}:uploadSessionVideo"
ffmpeg_download_url="${SW_INTERNAL_URL}/internal/ffmpeg:download"

# The startup bootstrap redirects the container's whole stdout/stderr into one file (stock selenium logs
# to stdout, not a per-session file), so a session's logs are the slice appended between its start and
# end. Capped to the last max_log_bytes (session end + errors) if larger.
session_log_glob="${SW_SESSION_LOG_GLOB:-/tmp/sw-session.log}"
max_log_bytes="${SW_MAX_LOG_BYTES:-10485760}"

# Video is recorded by a static ffmpeg (fetched once from the control plane) grabbing the X display the
# browser renders on. The record size matches the node's screen (SE_SCREEN_*), so ffmpeg and Xvfb agree.
ffmpeg_bin="/tmp/sw-ffmpeg"
video_file="/tmp/sw-session.mp4"
video_fifo="/tmp/sw-ffmpeg.fifo"
video_display=":99"
video_size="${SE_SCREEN_WIDTH:-1360}x${SE_SCREEN_HEIGHT:-1020}"
video_fps="${SW_VIDEO_FPS:-15}"
max_video_seconds="${SW_MAX_VIDEO_SECONDS:-600}"
ffmpeg_pid=""

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

# Whether the current session opted into video, read from the sw:video vendor capability on the active
# node session (same shape as sw:logging above).
session_wants_video() {
    curl -sf "${NODE_URL}/status" \
        | jq -e 'first(.. | objects | select(has("session")) | .session | select(. != null))
                 | .capabilities["sw:video"] == true' >/dev/null 2>&1
}

# Fetch the static ffmpeg binary once from the control plane, keyed by architecture. Best effort: on any
# failure video is simply skipped. Runs in the background at startup so it never blocks heartbeats and is
# ready before the first session; downloads to a .part file and moves it into place so a partial download
# is never seen as ready.
download_ffmpeg() {
    if [ -x "${ffmpeg_bin}" ]; then return 0; fi

    local arch
    case "$(uname -m)" in
        x86_64|amd64) arch=amd64 ;;
        aarch64|arm64) arch=arm64 ;;
        *) log "no ffmpeg build for arch $(uname -m); video disabled"; return 1 ;;
    esac

    if curl -fsSL -H "x-internal-secret: ${SW_INTERNAL_SECRET}" \
        "${ffmpeg_download_url}?arch=${arch}" -o "${ffmpeg_bin}.part" --max-time 120; then
        chmod +x "${ffmpeg_bin}.part" && mv "${ffmpeg_bin}.part" "${ffmpeg_bin}" && log "ffmpeg ready (${arch})"
    else
        rm -f "${ffmpeg_bin}.part"
        log "ffmpeg download failed; video disabled"
    fi
}

# Start recording the browser's X display to video_file in the background. Returns non-zero (no recording)
# if ffmpeg is not available yet (silent — it is retried on the next tick while the session is busy, and
# download_ffmpeg already logs a failed fetch). ffmpeg is stopped by writing "q" to its stdin (see below),
# carried over a fifo whose write end is held open on fd 3 for the whole recording — a backgrounded process
# in a non-interactive shell inherits SIGINT/SIGQUIT as ignored, so signals cannot stop it gracefully, and
# a hard kill would leave the mp4 unfinalized (no moov atom, unplayable).
start_recording() {
    if [ ! -x "${ffmpeg_bin}" ]; then
        return 1
    fi

    rm -f "${video_fifo}"
    mkfifo "${video_fifo}"
    exec 3<>"${video_fifo}"

    "${ffmpeg_bin}" -hide_banner -loglevel warning \
        -f x11grab -video_size "${video_size}" -r "${video_fps}" -i "${video_display}" \
        -c:v libx264 -preset superfast -pix_fmt yuv420p -movflags +faststart \
        -t "${max_video_seconds}" "${video_file}" -y <"${video_fifo}" >/tmp/sw-ffmpeg.log 2>&1 &
    ffmpeg_pid=$!
    log "recording video (pid ${ffmpeg_pid}, ${video_size})"
}

# Ask ffmpeg to quit and finalize the mp4, then ship it. The wait is bounded so a wedged encoder can never
# hang the heartbeat loop — as a last resort it is killed (a broken file beats a stuck environment). Best
# effort: any non-2xx (incl. 404) is logged and ignored — it must never bring the environment down.
stop_recording_and_ship() {
    if [ -z "${ffmpeg_pid}" ]; then return 0; fi

    printf q >&3 2>/dev/null
    local waited=0
    while kill -0 "${ffmpeg_pid}" 2>/dev/null && [ "${waited}" -lt 15 ]; do
        sleep 1
        waited=$((waited + 1))
    done
    if kill -0 "${ffmpeg_pid}" 2>/dev/null; then
        log "ffmpeg did not stop in time; killing"
        kill -9 "${ffmpeg_pid}" 2>/dev/null
    fi
    exec 3>&- 2>/dev/null
    rm -f "${video_fifo}"
    ffmpeg_pid=""

    if [ ! -s "${video_file}" ]; then
        log "no video recorded; nothing to ship"
        return 0
    fi

    local size code
    size=$(wc -c < "${video_file}" | tr -d '[:space:]')
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${session_video_url}" \
        -H "x-internal-secret: ${SW_INTERNAL_SECRET}" \
        -H "content-type: video/mp4" \
        --max-time 120 --data-binary @"${video_file}")

    case "${code}" in
        2*) log "shipped session video (${size} bytes)" ;;
        *) log "session video upload failed (${code}); dropping" ;;
    esac

    rm -f "${video_file}"
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

# Pre-fetch ffmpeg in the background so it is ready before the first session that opts into video, without
# ever blocking the heartbeat loop.
download_ffmpeg &

# Heartbeat loop, tracking session start/end transitions to capture and ship the session's logs and video.
# `idle_offset` is the log size at the last idle tick; a session's slice starts there (not at the tick
# that first saw it busy) so the session's own opening lines aren't missed. The per-session opt-ins
# (`capture`/`recording`) are resolved LAZILY on each busy tick, not only at the busy edge: on a Grid the
# session's capabilities can land in /status a tick after its slot becomes busy, so an edge-only check
# would read the opt-in as false and skip the whole session's logs/video.
prev_busy=false
capture=false
recording=false
idle_offset=0
log_offset=0

while true; do
    sleep "${INTERVAL}"

    busy=$(node_busy)
    report "{\"busy\":${busy}}" || true

    if [ "${busy}" = "true" ]; then
        if [ "${prev_busy}" = "false" ]; then
            log_offset="${idle_offset}"
            capture=false
            recording=false
        fi
        if [ "${capture}" = "false" ] && session_wants_logs; then capture=true; fi
        if [ "${recording}" = "false" ] && session_wants_video && start_recording; then recording=true; fi
    else
        if [ "${prev_busy}" = "true" ]; then
            if [ "${capture}" = "true" ]; then ship_session_logs "${log_offset}"; fi
            if [ "${recording}" = "true" ]; then stop_recording_and_ship; fi
            capture=false
            recording=false
        fi
        idle_offset=$(log_size)
    fi

    prev_busy="${busy}"
done
