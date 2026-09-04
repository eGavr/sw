#!/usr/bin/env bash
# Pool-host agent: the reconcile daemon of one pooled machine (a leased metal server or the operator's
# own Mac/lab box). One file, two modes:
#   agent (default)  — check in with the control plane every few seconds and converge the machine's
#                      slots to the desired set the check-in answers with (kubelet-style);
#   slot             — supervise ONE seat: an Android emulator + Appium + the Grid-status shim on the
#                      slot's wd port + the stock environment heartbeat agent.
#
# The check-in is POST /internal/poolHosts/{id}:heartbeat (per-host bearer token): the body reports
# where the machine is reachable, the response lists the desired seats — launch params, explicit ports
# (the control plane owns the slot-port contract) and a per-environment agent token minted for this
# response. Slots not desired anymore are stopped; desired slots not running are started; a crashed
# slot process is simply started again on the next tick (its environment's own reapers decide when to
# give up). On 404 the machine is unknown to the control plane (returned/forgotten) — the agent
# self-fences: stops every slot and exits.
#
# Portability: no systemd — slots are process groups with pid files under the state dir, so the agent
# also re-adopts running slots after its own restart. JSON is parsed with python3 (present on macOS
# and the metal golden image alike).
set -u

MODE="${1:-agent}"

# ---------------------------------------------------------------- slot mode
# Environment (set by the agent when spawning): SW_ENVIRONMENT_ID, SW_AVD, SW_WD_PORT, SW_APPIUM_PORT,
# SW_CONSOLE_PORT, SW_ENV_AGENT_TOKEN, SW_INTERNAL_URL, SW_HOST_IP, SW_SLOT_DIR.
run_slot() {
    : "${SW_ENVIRONMENT_ID:?}" "${SW_AVD:?}" "${SW_WD_PORT:?}" "${SW_APPIUM_PORT:?}"
    : "${SW_CONSOLE_PORT:?}" "${SW_ENV_AGENT_TOKEN:?}" "${SW_INTERNAL_URL:?}" "${SW_HOST_IP:?}" "${SW_SLOT_DIR:?}"

    mkdir -p "${SW_SLOT_DIR}"
    cd "${SW_SLOT_DIR}"

    # Everything the slot prints lands in one file — the same "session log = slice of the node log"
    # contract the docker environments use.
    exec >>"${SW_SLOT_DIR}/session.log" 2>&1

    emulator_bin="${ANDROID_HOME:-$HOME/Library/Android/sdk}/emulator/emulator"
    serial="emulator-${SW_CONSOLE_PORT}"

    echo "[slot ${SW_ENVIRONMENT_ID}] starting emulator ${SW_AVD} on console ${SW_CONSOLE_PORT}"
    # -read-only lets N instances share one AVD; the console port pins the adb serial to this slot.
    "${emulator_bin}" -avd "${SW_AVD}" -port "${SW_CONSOLE_PORT}" -read-only \
        -no-window -no-audio -no-boot-anim -no-snapshot &

    adb start-server >/dev/null 2>&1 || true
    adb -s "${serial}" wait-for-device
    for _ in $(seq 1 120); do
        if [ "$(adb -s "${serial}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
            echo "[slot ${SW_ENVIRONMENT_ID}] android booted"
            break
        fi
        sleep 3
    done

    # Appium is pinned to this slot's emulator via default capabilities — several emulators share one
    # adb server, so the udid is not optional here (unlike the single-device redroid node).
    appium --address 127.0.0.1 --port "${SW_APPIUM_PORT}" --base-path / --relaxed-security \
        --default-capabilities "{\"appium:udid\":\"${serial}\",\"platformName\":\"Android\",\"appium:automationName\":\"UiAutomator2\"}" &

    # The slot's single wd door: Selenium-Grid-shaped /status (the heartbeat agent and the allocator
    # read it), everything else proxied to Appium. Same contract as the android-node nginx+shim pair,
    # collapsed into one dependency-free node script.
    cat >"${SW_SLOT_DIR}/wd-door.js" <<'DOOR'
const http = require("http");
const [wdPort, appiumPort] = process.argv.slice(2).map(Number);
function sessions(cb) {
    http.get(`http://127.0.0.1:${appiumPort}/sessions`, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => { try { cb(JSON.parse(body).value || []); } catch { cb([]); } });
    }).on("error", () => cb([]));
}
http.createServer((req, res) => {
    if (req.url.split("?")[0] === "/status") {
        sessions((list) => {
            const slot = list.length
                ? { session: { sessionId: list[0].id, capabilities: list[0].capabilities || {} } }
                : { session: null };
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ value: { ready: true, message: "pool slot", nodes: [{ slots: [slot] }] } }));
        });
        return;
    }
    const upstream = http.request(
        { host: "127.0.0.1", port: appiumPort, path: req.url, method: req.method, headers: req.headers },
        (up) => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); },
    );
    upstream.on("error", () => { res.writeHead(502).end(); });
    req.pipe(upstream);
}).listen(wdPort, "0.0.0.0");
DOOR
    node "${SW_SLOT_DIR}/wd-door.js" "${SW_WD_PORT}" "${SW_APPIUM_PORT}" &

    # The stock environment heartbeat agent, fetched from the control plane (never baked anywhere):
    # registers the environment at this slot's endpoint and keeps its liveness/busy word fresh.
    for _ in $(seq 1 5); do
        curl -sf -H "Authorization: Bearer ${SW_ENV_AGENT_TOKEN}" \
            "${SW_INTERNAL_URL}/internal/agentScript:download" -o "${SW_SLOT_DIR}/heartbeat-agent.sh" && break
        sleep 2
    done

    SW_INTERNAL_TOKEN="${SW_ENV_AGENT_TOKEN}" \
    SW_ENDPOINT="http://${SW_HOST_IP}:${SW_WD_PORT}" \
    SW_NODE_URL="http://127.0.0.1:${SW_WD_PORT}" \
    SW_SESSION_LOG_GLOB="${SW_SLOT_DIR}/session.log" \
        bash "${SW_SLOT_DIR}/heartbeat-agent.sh" &

    # Supervise: the first casualty takes the whole slot down (process group), and the agent's next
    # tick starts it afresh while the seat is still desired.
    wait -n
    echo "[slot ${SW_ENVIRONMENT_ID}] a slot process died — stopping the slot"
    adb -s "${serial}" emu kill >/dev/null 2>&1 || true
    kill 0
}

# ---------------------------------------------------------------- agent mode
run_agent() {
    : "${SW_HOST_ID:?SW_HOST_ID is required}"
    : "${SW_HOST_TOKEN:?SW_HOST_TOKEN is required}"
    : "${SW_INTERNAL_URL:?SW_INTERNAL_URL is required}"

    interval="${SW_HEARTBEAT_INTERVAL_SECONDS:-3}"
    state_dir="${SW_STATE_DIR:-/tmp/sw-pool-host/${SW_HOST_ID}}"
    mkdir -p "${state_dir}"

    # Where sessions reach this machine. On a dev Mac with the control plane alongside, loopback is
    # exactly right; a real machine reports its private address (override with SW_HOST_IP).
    host_ip="${SW_HOST_IP:-$(detect_host_ip)}"
    heartbeat_url="${SW_INTERNAL_URL}/internal/poolHosts/${SW_HOST_ID}:heartbeat"

    echo "[pool-host ${SW_HOST_ID}] agent up, reporting ${host_ip}, state in ${state_dir}"

    while true; do
        body="{\"hostIp\":\"${host_ip}\"}"
        response_file="${state_dir}/heartbeat.json"
        status=$(curl -s -o "${response_file}" -w "%{http_code}" -X POST \
            -H "Authorization: Bearer ${SW_HOST_TOKEN}" -H "content-type: application/json" \
            -d "${body}" "${heartbeat_url}" || echo "000")

        if [ "${status}" = "404" ]; then
            # The machine is unknown to the control plane (returned/forgotten) — self-fence.
            echo "[pool-host ${SW_HOST_ID}] 404 from the control plane — stopping every slot and exiting"
            for pid_file in "${state_dir}"/slots/*/pgid; do
                [ -f "${pid_file}" ] && stop_slot "$(dirname "${pid_file}")"
            done
            exit 0
        fi

        if [ "${status}" = "200" ]; then
            reconcile "${response_file}" "${state_dir}" "${host_ip}"
        else
            echo "[pool-host ${SW_HOST_ID}] check-in failed (${status}), retrying"
        fi

        sleep "${interval}"
    done
}

# Converge running slots to the desired set from the last check-in response.
reconcile() {
    response_file="$1"; state_dir="$2"; host_ip="$3"
    slots_dir="${state_dir}/slots"
    mkdir -p "${slots_dir}"

    # One line per desired seat: envId wd appium console avd internalUrl token
    desired_file="${state_dir}/desired.tsv"
    python3 - "$response_file" >"${desired_file}" <<'PARSE'
import json, sys
with open(sys.argv[1]) as f:
    doc = json.load(f)
for slot in doc.get("slots", []):
    launch = slot.get("launch", {})
    ports = slot.get("ports", {})
    print("\t".join(str(x) for x in [
        slot["environmentId"], ports["wd"], ports["appium"], ports["console"],
        launch.get("avd", ""), launch.get("internalUrl", ""), slot["agentToken"],
    ]))
PARSE

    # Stop slots that are no longer desired.
    for slot_dir in "${slots_dir}"/*/; do
        [ -d "${slot_dir}" ] || continue
        env_id="$(basename "${slot_dir}")"
        if ! cut -f1 "${desired_file}" | grep -qx "${env_id}"; then
            echo "[pool-host] seat ${env_id} no longer desired — stopping its slot"
            stop_slot "${slot_dir}"
        fi
    done

    # Start (or restart after a crash) every desired slot that is not running.
    while IFS=$'\t' read -r env_id wd appium console avd internal_url token; do
        [ -n "${env_id}" ] || continue
        slot_dir="${slots_dir}/${env_id}"

        if [ -f "${slot_dir}/pgid" ] && kill -0 -- "-$(cat "${slot_dir}/pgid")" 2>/dev/null; then
            continue
        fi

        echo "[pool-host] starting slot for ${env_id} (wd :${wd}, avd ${avd})"
        mkdir -p "${slot_dir}"
        SW_ENVIRONMENT_ID="${env_id}" SW_AVD="${avd}" SW_WD_PORT="${wd}" SW_APPIUM_PORT="${appium}" \
        SW_CONSOLE_PORT="${console}" SW_ENV_AGENT_TOKEN="${token}" SW_INTERNAL_URL="${internal_url}" \
        SW_HOST_IP="${host_ip}" SW_SLOT_DIR="${slot_dir}" \
            setsid bash "$0" slot &
        echo "$!" >"${slot_dir}/pgid"
    done <"${desired_file}"
}

stop_slot() {
    slot_dir="$1"
    if [ -f "${slot_dir}/pgid" ]; then
        pgid="$(cat "${slot_dir}/pgid")"
        kill -TERM -- "-${pgid}" 2>/dev/null || true
        sleep 2
        kill -KILL -- "-${pgid}" 2>/dev/null || true
    fi
    rm -rf "${slot_dir}"
}

detect_host_ip() {
    if command -v ipconfig >/dev/null 2>&1; then
        ipconfig getifaddr en0 2>/dev/null && return
    fi
    if command -v hostname >/dev/null 2>&1; then
        hostname -I 2>/dev/null | awk '{print $1}' | grep . && return
    fi
    echo "127.0.0.1"
}

case "${MODE}" in
    slot) run_slot ;;
    agent) run_agent ;;
    *) echo "usage: $0 [agent|slot]" >&2; exit 64 ;;
esac
