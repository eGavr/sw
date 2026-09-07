#!/usr/bin/env bash
# The linux node script, fetched by the base image's bootstrap at container start. It turns a bare
# ubuntu-with-a-display-stack image into this environment's browser node:
#   1. brings up the headless display (Xvfb), a window manager and the VNC bridge (x11vnc -> websockify)
#      the interactive viewer connects to;
#   2. delivers the environment's applications — every build with an artifact is pulled through the
#      control plane (`:downloadApp`, plus `:downloadWebdriver` for a paired chromedriver), unpacked, and
#      its honest version detected from the binary itself (`chrome --version`) — a linux build has no
#      package id, so only the version is reported;
#   3. starts chromedriver and, in front of it, the wd door (fetched from the control plane too): the
#      Selenium-Grid-shaped /status the heartbeat agent reads, the one-session rule, the idle timeout and
#      the websocket routes the control plane proxies.
# The heartbeat agent itself is started by the compute gateway's bootstrap command before this script
# runs; it waits for the door's /status and registers the environment with the detected versions.
set -u

: "${SW_ENVIRONMENT_ID:?}" "${SW_INTERNAL_URL:?}" "${SW_INTERNAL_TOKEN:?}"

node_port="${SW_NODE_PORT:-4444}"
driver_port="${SW_WEBDRIVER_PORT:-9515}"
vnc_ws_port="${SW_VNC_WS_PORT:-7900}"
screen_width="${SW_SCREEN_WIDTH:-1360}"
screen_height="${SW_SCREEN_HEIGHT:-1020}"
detected_file="${SW_DETECTED_APPS_FILE:-/tmp/sw-detected.json}"
apps_dir="${SW_APPS_DIR:-/opt/sw/apps}"

log() { echo "[linux-node] $*"; }

# A fatal error ends the node — after a moment, so the last lines reach the log mirror the container's
# `docker logs` reads (the bootstrap tails the session log file this script writes to).
die() {
    log "$* — giving up"
    sleep 2
    kill 0
    exit 1
}

pids=""
spawn() { "$@" & pids="${pids} $!"; }

# ---------------------------------------------------------------- display + VNC
export DISPLAY="${DISPLAY:-:99}"
spawn Xvfb "${DISPLAY}" -screen 0 "${screen_width}x${screen_height}x24" -nolisten tcp -ac
for _ in $(seq 1 50); do xdpyinfo -display "${DISPLAY}" >/dev/null 2>&1 && break; sleep 0.2; done
spawn fluxbox
# No password: access is gated by possession of the unguessable session id, checked by the door. The
# heartbeat agent kills x11vnc on every session end (a viewer must not outlive its session), so it runs
# in a restart loop rather than as a one-shot daemon.
spawn bash -c 'while true; do x11vnc -display "$1" -forever -shared -nopw -rfbport 5900 -quiet; sleep 1; done' x11vnc-loop "${DISPLAY}"
spawn websockify "${vnc_ws_port}" 127.0.0.1:5900

# ---------------------------------------------------------------- delivery
fetch() {
    local resource="$1" target="$2"
    for _ in $(seq 1 3); do
        curl -sf -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
            "${SW_INTERNAL_URL}/internal/${resource}" -o "${target}" && return 0
        sleep 2
    done
    return 1
}

# Unpacks an artifact (zip or tarball) into a directory; a bare binary is left as is.
unpack() {
    local file="$1" into="$2"
    mkdir -p "${into}"
    case "$(file -b --mime-type "${file}" 2>/dev/null || echo unknown)" in
        application/zip) unzip -q -o "${file}" -d "${into}" ;;
        application/gzip|application/x-gzip) tar -xzf "${file}" -C "${into}" ;;
        application/x-xz) tar -xJf "${file}" -C "${into}" ;;
        *) cp "${file}" "${into}/" ;;
    esac
}

# The executable a delivered browser build runs as: Chrome for Testing unpacks to chrome-linux64/chrome;
# any other layout falls back to the first executable named like a browser.
browser_binary() {
    local dir="$1" candidate
    for candidate in "${dir}"/chrome-linux64/chrome "${dir}"/chrome "${dir}"/*/chrome "${dir}"/chromium "${dir}"/*/chromium; do
        [ -x "${candidate}" ] && { echo "${candidate}"; return 0; }
    done
    find "${dir}" -maxdepth 3 -type f -perm -u+x \( -name chrome -o -name chromium -o -name google-chrome \) | head -1
}

webdriver_binary() {
    local dir="$1" candidate
    for candidate in "${dir}"/chromedriver-linux64/chromedriver "${dir}"/chromedriver "${dir}"/*/chromedriver; do
        [ -x "${candidate}" ] && { echo "${candidate}"; return 0; }
    done
    find "${dir}" -maxdepth 3 -type f -perm -u+x -name chromedriver | head -1
}

echo "[]" >"${detected_file}"
mkdir -p "${apps_dir}"
browser=""
webdriver=""

for app_entry in $(echo "${SW_APPS:-}" | tr ',' ' '); do
    app_name="${app_entry%%~*}"
    wants_webdriver="${app_entry##*~}"
    archive="${apps_dir}/${app_name}.artifact"

    log "delivering ${app_name}"
    if ! fetch "environments/${SW_ENVIRONMENT_ID}/applications/${app_name}:downloadApp" "${archive}"; then
        die "${app_name}: artifact download failed"
    fi
    unpack "${archive}" "${apps_dir}/${app_name}"
    binary="$(browser_binary "${apps_dir}/${app_name}")"

    if [ -z "${binary}" ]; then
        die "${app_name}: no runnable binary in the artifact"
    fi

    # "Google Chrome for Testing 152.0.7977.82" -> the last dotted-number word is the version.
    detected_version="$("${binary}" --version 2>/dev/null | grep -oE '[0-9]+(\.[0-9]+)+' | tail -1)"
    log "${app_name}: detected version ${detected_version:-?}"
    node -e '
const fs = require("fs");
const [file, nameAlias, version] = process.argv.slice(1);
const reports = JSON.parse(fs.readFileSync(file, "utf8"));
reports.push({ nameAlias, ...(version ? { version } : {}) });
fs.writeFileSync(file, JSON.stringify(reports));
' "${detected_file}" "${app_name}" "${detected_version}"

    # One browser per environment drives the node; the first delivered one wins.
    [ -z "${browser}" ] && browser="${binary}"

    if [ "${wants_webdriver}" = "1" ]; then
        driver_archive="${apps_dir}/${app_name}.webdriver"
        if ! fetch "environments/${SW_ENVIRONMENT_ID}/applications/${app_name}:downloadWebdriver" "${driver_archive}"; then
            die "${app_name}: webdriver download failed"
        fi
        unpack "${driver_archive}" "${apps_dir}/${app_name}-webdriver"
        [ -z "${webdriver}" ] && webdriver="$(webdriver_binary "${apps_dir}/${app_name}-webdriver")"
    fi
done

if [ -z "${browser}" ] || [ -z "${webdriver}" ]; then
    die "the environment delivered no browser with a paired webdriver — nothing to serve"
fi
chmod +x "${browser}" "${webdriver}" 2>/dev/null || true

# ---------------------------------------------------------------- chromedriver + door
# chromedriver finds the browser by the binary the door injects into every session's chromeOptions.
spawn "${webdriver}" --port="${driver_port}" --allowed-ips=127.0.0.1 --allowed-origins='*'
for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:${driver_port}/status" >/dev/null && break; sleep 0.2; done

if ! fetch "wdDoor:download" /tmp/sw-wd-door.js; then
    die "wd door download failed"
fi
SW_DOOR_PORT="${node_port}" SW_DOOR_UPSTREAM_PORT="${driver_port}" SW_DOOR_VNC_WS_PORT="${vnc_ws_port}" \
SW_DOOR_BROWSER_BINARY="${browser}" \
SW_DOOR_IDLE_TIMEOUT_SECONDS="${SW_SESSION_IDLE_TIMEOUT_SECONDS:-300}" \
    spawn node /tmp/sw-wd-door.js
log "node up: door :${node_port} -> chromedriver :${driver_port}, display ${DISPLAY} ${screen_width}x${screen_height}"

# Supervise: the first casualty takes the node down — the container exits, the environment's own
# reapers notice (the heartbeat stops) and reclaim it.
while true; do
    for pid in ${pids}; do
        if ! kill -0 "${pid}" 2>/dev/null; then
            log "a node process died — stopping the node"
            kill 0
            exit 1
        fi
    done
    sleep 3
done
