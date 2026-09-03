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
# Reuse safety: an environment is reused for the next session within seconds (allocation retries a
# transient shortage, so immediate reuse is the norm). Artifact shipping must therefore never block the
# heartbeat loop and never share mutable state with the next session. So on the session-end edge the
# agent only does the FAST, synchronous part (snapshot the log slice, signal the recorder), and the slow
# uploads run detached; every artifact file is keyed (per recording / per snapshot) so a previous
# session still uploading never collides with the next session's recording.
#
# Self-fencing: if the backend replies 404 the environment is unknown to it (its row is gone), so this
# container is an orphan — it shuts the whole environment down. Any other failure (network, 5xx, a
# transient state conflict) is retried, so a brief backend blip never tears live environments down.
set -u

NODE_URL="${SW_NODE_URL:-http://localhost:4444}"
INTERVAL="${SW_HEARTBEAT_INTERVAL_SECONDS:-3}"

: "${SW_ENVIRONMENT_ID:?SW_ENVIRONMENT_ID is required}"
: "${SW_INTERNAL_URL:?SW_INTERNAL_URL is required}"
: "${SW_INTERNAL_TOKEN:?SW_INTERNAL_TOKEN is required}"
: "${SW_ENDPOINT:?SW_ENDPOINT is required}"

heartbeat_url="${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}:heartbeat"
ffmpeg_download_url="${SW_INTERNAL_URL}/internal/ffmpeg:download"

# The startup bootstrap redirects the container's whole stdout/stderr into one file (stock selenium logs
# to stdout, not a per-session file), so a session's logs are the slice appended between its start and
# end. Capped to the last max_log_bytes (session end + errors) if larger.
session_log_glob="${SW_SESSION_LOG_GLOB:-/tmp/sw-session.log}"
max_log_bytes="${SW_MAX_LOG_BYTES:-10485760}"

# Video is recorded by a static ffmpeg (fetched once from the control plane) grabbing the X display the
# browser renders on. The record size matches the node's screen (SE_SCREEN_*), so ffmpeg and Xvfb agree.
ffmpeg_bin="/tmp/sw-ffmpeg"
video_display=":99"
video_size="${SE_SCREEN_WIDTH:-1360}x${SE_SCREEN_HEIGHT:-1020}"
video_fps="${SW_VIDEO_FPS:-15}"
max_video_seconds="${SW_MAX_VIDEO_SECONDS:-600}"

# NetBridge forwarder (fetched once from the control plane): a loopback SOCKS5 proxy the browser is pointed
# at, tunnelling to the user's network over the control plane. Only launched when SW_NETBRIDGE_URL is set.
netbridge_bin="/tmp/sw-netbridge"
netbridge_download_url="${SW_INTERNAL_URL}/internal/netbridge:download"

# Monotonic counters keying each recording / log snapshot to its own files, so a previous session still
# uploading never touches the next session's. `current_rec_token` names the recording in flight.
rec_seq=0
log_seq=0
current_rec_token=""

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

# The WebDriver session id the node currently holds (empty if none), read from the same active-session
# object as the opt-ins. The logs are keyed by it (its fingerprint, server-side) so they are addressable
# by session on read; it must be captured while the session is live, since it leaves /status on end. The
# Grid slot briefly reports the placeholder "reserved" before the real id lands, so that is skipped —
# the agent just retries on the next tick until the real id appears.
node_session_id() {
    curl -sf "${NODE_URL}/status" \
        | jq -r '[.. | objects | select(has("session")) | .session | select(. != null) | .sessionId
                  | select(. != null and . != "reserved")] | first // empty' 2>/dev/null
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

    if curl -fsSL -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
        "${ffmpeg_download_url}?arch=${arch}" -o "${ffmpeg_bin}.part" --max-time 120; then
        chmod +x "${ffmpeg_bin}.part" && mv "${ffmpeg_bin}.part" "${ffmpeg_bin}" && log "ffmpeg ready (${arch})"
    else
        rm -f "${ffmpeg_bin}.part"
        log "ffmpeg download failed; video disabled"
    fi
}

# Fetch the NetBridge forwarder once and launch it (loopback SOCKS5 + outbound tunnel to the control
# plane). Off unless SW_NETBRIDGE_URL is injected; best effort, and never blocks the heartbeat loop. The
# binary reads its config (URL, proxy port, token) from the container env it inherits here.
launch_netbridge() {
    [ -n "${SW_NETBRIDGE_URL:-}" ] || return 0

    local arch
    case "$(uname -m)" in
        x86_64|amd64) arch=amd64 ;;
        aarch64|arm64) arch=arm64 ;;
        *) log "no netbridge build for arch $(uname -m); local network disabled"; return 1 ;;
    esac

    if curl -fsSL -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
        "${netbridge_download_url}?arch=${arch}" -o "${netbridge_bin}.part" --max-time 120; then
        chmod +x "${netbridge_bin}.part" && mv "${netbridge_bin}.part" "${netbridge_bin}"
        "${netbridge_bin}" &
        log "netbridge forwarder started (${arch})"
    else
        rm -f "${netbridge_bin}.part"
        log "netbridge download failed; local network disabled"
    fi
}

# Upload one finished mp4 to the control plane, keyed by the session id. Best effort: any non-2xx is
# logged and ignored — it must never bring the environment down.
upload_video() {
    local file="$1" session_id="$2" size code url
    size=$(wc -c < "${file}" | tr -d '[:space:]')
    url="${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}/sessions/${session_id}:uploadSessionVideo"
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${url}" \
        -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
        -H "content-type: video/mp4" \
        --max-time 120 --data-binary @"${file}")

    case "${code}" in
        2*) log "shipped session video (${size} bytes)" ;;
        *) log "session video upload failed (${code}); dropping" ;;
    esac
}

# The detached recorder for one session, keyed by token. It records the X display until the session-end
# signal (a stop file carrying the session id — reliably known only at the edge) arrives, then finalizes
# the mp4 and uploads it. Running detached is what keeps the heartbeat loop free: the slow finalize +
# upload never block it, and the token-keyed fifo/file never collide with the next session's recording.
# ffmpeg is stopped by writing "q" to its stdin over a fifo held open on fd 9 (a backgrounded process in
# a non-interactive shell inherits SIGINT/SIGQUIT as ignored, so signals cannot stop it gracefully, and a
# hard kill would leave the mp4 unfinalized — no moov atom, unplayable).
record_session() {
    local token="$1"
    local fifo="/tmp/sw-rec-${token}.fifo"
    local file="/tmp/sw-rec-${token}.mp4"
    local stop="/tmp/sw-rec-${token}.stop"
    local errlog="/tmp/sw-rec-${token}.err"

    rm -f "${fifo}"
    mkfifo "${fifo}" || return 0
    exec 9<>"${fifo}"

    "${ffmpeg_bin}" -hide_banner -loglevel warning \
        -f x11grab -video_size "${video_size}" -r "${video_fps}" -i "${video_display}" \
        -c:v libx264 -preset superfast -pix_fmt yuv420p -movflags +faststart \
        -t "${max_video_seconds}" "${file}" -y <"${fifo}" >"${errlog}" 2>&1 &
    local pid=$!

    # Wait for the session-end signal; ffmpeg may self-exit first (hit the duration cap), the file is
    # complete either way and we still wait for the signal to learn the session id to upload under.
    while [ ! -e "${stop}" ]; do sleep 1; done
    local session_id
    session_id=$(cat "${stop}" 2>/dev/null)

    if kill -0 "${pid}" 2>/dev/null; then
        printf q >&9 2>/dev/null
        local waited=0
        while kill -0 "${pid}" 2>/dev/null && [ "${waited}" -lt 30 ]; do
            sleep 1
            waited=$((waited + 1))
        done
        kill -0 "${pid}" 2>/dev/null && kill -9 "${pid}" 2>/dev/null
    fi

    exec 9>&-
    rm -f "${fifo}" "${stop}" "${errlog}"

    if [ -s "${file}" ] && [ -n "${session_id}" ]; then
        upload_video "${file}" "${session_id}"
    fi
    rm -f "${file}"
}

# Launch a detached recorder for the current session. Returns non-zero (no recording) if ffmpeg is not
# available yet — it is retried on the next busy tick while the session lasts.
start_recording() {
    if [ ! -x "${ffmpeg_bin}" ]; then
        return 1
    fi

    rec_seq=$((rec_seq + 1))
    current_rec_token="${rec_seq}"
    record_session "${current_rec_token}" &
    log "recording video (token ${current_rec_token})"
}

# Signal the active recording to stop, handing it the session id via the stop file; returns immediately.
# The recorder then finalizes and uploads in the background, so the heartbeat loop is never blocked.
stop_recording() {
    local session_id="$1"
    if [ -z "${current_rec_token}" ]; then return 0; fi

    printf '%s' "${session_id}" > "/tmp/sw-rec-${current_rec_token}.stop"
    current_rec_token=""
}

# Total bytes currently in the node log files (0 if none exist yet). The glob is intentionally unquoted
# so the shell expands it; a non-matching glob reads as 0 bytes.
log_size() {
    cat ${session_log_glob} 2>/dev/null | wc -c | tr -d '[:space:]'
}

# Upload one finished log snapshot, keyed by the session id. Best effort: non-2xx is logged and ignored.
upload_logs() {
    local snapshot="$1" session_id="$2" available="$3" code url
    url="${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}/sessions/${session_id}:uploadSessionLogs"
    code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${url}" \
        -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
        -H "content-type: application/octet-stream" \
        --max-time 20 --data-binary @"${snapshot}")

    case "${code}" in
        2*) log "shipped session logs (${available} bytes)" ;;
        *) log "session log upload failed (${code}); dropping" ;;
    esac
}

# Snapshot this session's log slice (the bytes appended since start_offset) to a keyed file SYNCHRONOUSLY
# at the edge — so the next session, which starts within seconds, cannot contaminate it — then upload
# that snapshot in the background so the heartbeat loop is never blocked. Nothing to ship if the slice is
# empty; oversized slices are tailed to the last max_log_bytes (session end + errors).
snapshot_and_ship_logs() {
    local start_offset="$1" session_id="$2" total tail_start snapshot
    total=$(log_size)

    if [ "${total:-0}" -le "${start_offset}" ]; then
        return 0
    fi

    tail_start=$((start_offset + 1))
    if [ $((total - start_offset)) -gt "${max_log_bytes}" ]; then
        tail_start=$((total - max_log_bytes + 1))
    fi

    log_seq=$((log_seq + 1))
    snapshot="/tmp/sw-session-${log_seq}.log"
    cat ${session_log_glob} 2>/dev/null | tail -c "+${tail_start}" > "${snapshot}"

    ( upload_logs "${snapshot}" "${session_id}" "$((total - start_offset))"; rm -f "${snapshot}" ) &
}

# POST a heartbeat and echo the HTTP status code (000 if the backend was unreachable).
send_heartbeat() {
    curl -s -o /dev/null -w "%{http_code}" -X POST "${heartbeat_url}" \
        -H "content-type: application/json" \
        -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
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

# Bring up the NetBridge forwarder (no-op unless SW_NETBRIDGE_URL is set) so its loopback SOCKS proxy is
# listening before the first session that opts in; backgrounded so the download never blocks heartbeats.
launch_netbridge &

# Heartbeat loop, tracking session start/end transitions to capture and ship the session's logs and video.
# `idle_offset` is the log size at the last idle tick; a session's slice starts there (not at the tick
# that first saw it busy) so the session's own opening lines aren't missed. Because the edge now only
# snapshots + signals (uploads are detached), `idle_offset` is captured promptly at the end of a session,
# before the reused next session writes — so the next session's slice starts at the right place. The
# per-session opt-ins (`capture`/`recording`) are resolved LAZILY on each busy tick, not only at the busy
# edge: on a Grid the session's capabilities can land in /status a tick after its slot becomes busy, so an
# edge-only check would read the opt-in as false and skip the whole session's logs/video.
prev_busy=false
capture=false
recording=false
session_id=""
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
            session_id=""
        fi
        # Capture the session id while it is live (it leaves /status on end); lazy like the opt-ins, since
        # it can land in /status a tick after the slot becomes busy.
        if [ -z "${session_id}" ]; then session_id=$(node_session_id); fi
        if [ "${capture}" = "false" ] && session_wants_logs; then capture=true; fi
        if [ "${recording}" = "false" ] && session_wants_video && start_recording; then recording=true; fi
    else
        if [ "${prev_busy}" = "true" ]; then
            # The session-end edge stays FAST — only a synchronous log snapshot and an instant recorder
            # signal; the slow uploads are detached. First cut every VNC pipe: x11vnc serves the DISPLAY,
            # not the session, so a surviving viewer would watch the environment's next session.
            # supervisord brings x11vnc back. Best effort.
            pkill -x x11vnc 2>/dev/null || true
            if [ "${capture}" = "true" ] && [ -n "${session_id}" ]; then
                snapshot_and_ship_logs "${log_offset}" "${session_id}"
            elif [ "${capture}" = "true" ]; then
                log "logging opted in but no session id was captured; dropping this session's logs"
            fi
            if [ "${recording}" = "true" ]; then stop_recording "${session_id}"; fi
            capture=false
            recording=false
            session_id=""
        fi
        idle_offset=$(log_size)
    fi

    prev_busy="${busy}"
done
