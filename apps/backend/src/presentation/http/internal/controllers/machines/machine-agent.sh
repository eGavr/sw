#!/usr/bin/env bash
# Machine agent: the reconcile daemon of one machine of the inventory (a box the user attached to their
# self-hosted cloud, or a server we ordered for a lease). One file, two modes:
#   agent (default)  — sync with the control plane every few seconds: report the machine's facts and
#                      the slots it runs, converge its slots to the desired set the answer carries
#                      (kubelet-style);
#   slot             — supervise ONE seat: an Android emulator + Appium + the slot's VNC pipeline + the
#                      wd door on the slot's wd port + the stock environment heartbeat agent.
#
# The sync is POST /internal/machines/{id}:sync (the per-machine bearer token obtained at
# registration): the body reports facts (cores, virtualization, what is installed) and the slots seen
# running; the answer lists the desired seats of the machine's current lease — launch params, explicit
# ports (the control plane owns the slot-port contract) and a per-environment agent token minted for
# this answer — or none while the machine is free. Slots not desired anymore are stopped; desired slots
# not running are started; a crashed slot process is simply started again on the next tick (its
# environment's own reapers decide when to give up). On 404 the machine was detached — the agent
# self-fences: stops every slot and exits.
#
# Portability: no systemd required — slots are process groups with pid files under the state dir, so
# the agent also re-adopts running slots after its own restart. JSON is parsed with node (the wd door
# and Appium need it anyway).
set -u

MODE="${1:-agent}"

# Makes a downloaded webdriver runnable: an archive (Chrome for Testing ships chromedriver as a zip with
# a versioned folder) is unpacked and the chromedriver binary inside located; a bare binary is used as
# is. Prints the executable's path, nothing on failure.
stage_webdriver() {
    local artifact="$1" into="$2" binary
    [ -s "${artifact}" ] || return 0
    case "$(file -b --mime-type "${artifact}" 2>/dev/null || echo unknown)" in
        application/zip)
            mkdir -p "${into}" && unzip -q -o "${artifact}" -d "${into}" || return 0
            binary="$(find "${into}" -type f -name chromedriver | head -1)"
            ;;
        *) binary="${artifact}" ;;
    esac
    [ -n "${binary}" ] || return 0
    chmod +x "${binary}" 2>/dev/null || true
    echo "${binary}"
}

# Creates `<name>` as a copy of the base AVD's system image under the emulator's `<definition>` device
# profile (screen, density, RAM, sensors, keys) when it does not exist yet. The system image package is
# read off the base AVD (`image.sysdir.1`), so the version -> API-level mapping stays where the base was
# baked. Serialised with an atomic mkdir lock — several seats may ask for the same kind at once, and
# macOS ships no flock. avdmanager needs a JDK (JAVA_HOME on a dev Mac).
ensure_device_avd() {
    local base="$1" device="$2" name="$3"
    local avd_home="${ANDROID_AVD_HOME:-${ANDROID_SDK_HOME:-$HOME}/.android/avd}"
    local lock="${avd_home}/.sw-${name}.lock"

    [ -f "${avd_home}/${name}.ini" ] && return 0

    local base_ini="${avd_home}/${base}.avd/config.ini"
    if [ ! -f "${base_ini}" ]; then
        echo "[slot] base AVD ${base} not found (${base_ini}) — bake it per the runbook"
        return 1
    fi
    local sysdir package definition
    sysdir="$(sed -n 's/^image\.sysdir\.1 *= *//p' "${base_ini}" | tr -d '\r')"
    package="$(printf '%s' "${sysdir%/}" | tr '/' ';')"
    definition="$(printf '%s' "${device}" | tr '-' '_')"

    local avdmanager="${ANDROID_HOME}/cmdline-tools/latest/bin/avdmanager"
    [ -x "${avdmanager}" ] || avdmanager="avdmanager"

    for _ in $(seq 1 60); do
        if mkdir "${lock}" 2>/dev/null; then
            if [ ! -f "${avd_home}/${name}.ini" ]; then
                echo "[slot] creating AVD ${name}: ${package} as ${definition}"
                echo no | "${avdmanager}" create avd -n "${name}" -k "${package}" --device "${definition}" \
                    || { rmdir "${lock}"; return 1; }
            fi
            rmdir "${lock}"
            return 0
        fi
        sleep 2
    done
    echo "[slot] timed out waiting for the AVD lock ${lock}"
    return 1
}

# Fetches one control-plane asset with the seat's environment token; retried, false when it never came.
fetch_internal() {
    local resource="$1" target="$2"
    for _ in $(seq 1 5); do
        curl -sf -H "Authorization: Bearer ${SW_ENV_AGENT_TOKEN}" \
            "${SW_INTERNAL_URL}/internal/${resource}" -o "${target}" && return 0
        sleep 2
    done
    return 1
}

# ---------------------------------------------------------------- VNC
# The VNC picture's size: the device's screen scaled to fit the long side scrcpy renders at, so the X
# display and the mirror agree and nothing is letterboxed. Falls back to a phone-shaped default.
vnc_long_side=1280
vnc_default_geometry="720x1280"
# websockify's loopback port for a slot, derived from its RFB port the way adb derives from the console.
vnc_ws_offset=2000
# The X display of a slot's pipeline, derived from its RFB port: 5900 -> :100, 5901 -> :101, ...
vnc_display_offset=5800

vnc_geometry() {
    local size width height
    size="$(adb -s "$1" shell wm size 2>/dev/null | tr -d '\r' | sed -n 's/^Physical size: //p' | head -1)"
    width="${size%x*}"
    height="${size#*x}"
    if ! [ "${width}" -gt 0 ] 2>/dev/null || ! [ "${height}" -gt 0 ] 2>/dev/null; then
        echo "${vnc_default_geometry}"
    elif [ "${height}" -ge "${width}" ]; then
        echo "$((width * vnc_long_side / height))x${vnc_long_side}"
    else
        echo "${vnc_long_side}x$((height * vnc_long_side / width))"
    fi
}

has_vnc_stack() {
    command -v Xvfb >/dev/null && command -v x11vnc >/dev/null && command -v websockify >/dev/null \
        && command -v scrcpy >/dev/null
}

# The slot's VNC pipeline — the interactive viewer's source, per slot so seats never share a display.
# scrcpy mirrors the device onto a headless X display and injects the viewer's input back; x11vnc
# exports that display on the slot's RFB port; websockify bridges it to the loopback WebSocket the door
# routes /se/vnc to (the door is the one public surface). scrcpy and x11vnc run in restart loops:
# scrcpy exits whenever the device blinks, and the environment agent kills x11vnc on every session end
# (a viewer must not outlive its session). A host without the X stack but with docker (a dev Mac) runs
# the same pipeline as a sidecar container over the emulator's adb port; without either the seat
# honestly serves no VNC (sessions work, the viewer reports the route unavailable).
start_vnc() {
    local serial="$1" rfb_port="$2" ws_port="$3" geometry display wm
    geometry="$(vnc_geometry "${serial}")"

    if has_vnc_stack; then
        display=":$((rfb_port - vnc_display_offset))"
        echo "[slot ${SW_ENVIRONMENT_ID}] vnc: display ${display}, rfb :${rfb_port}, ws :${ws_port}, ${geometry}"
        Xvfb "${display}" -screen 0 "${geometry}x24" -nolisten tcp -ac &
        slot_pids="${slot_pids} $!"
        for _ in $(seq 1 50); do [ -S "/tmp/.X11-unix/X${display#:}" ] && break; sleep 0.2; done
        # A window manager keeps scrcpy's window focused, so keyboard input reaches the device.
        wm="$(command -v openbox || command -v fluxbox || true)"
        if [ -n "${wm}" ]; then
            DISPLAY="${display}" "${wm}" &
            slot_pids="${slot_pids} $!"
        fi
        DISPLAY="${display}" LIBGL_ALWAYS_SOFTWARE=1 SDL_VIDEODRIVER=x11 bash -c \
            'while true; do scrcpy -s "$1" --fullscreen --stay-awake --no-audio --max-fps=15 --max-size="$2"; sleep 2; done' \
            scrcpy-loop "${serial}" "${vnc_long_side}" &
        slot_pids="${slot_pids} $!"
        bash -c 'while true; do x11vnc -display "$1" -forever -shared -nopw -rfbport "$2" -quiet; sleep 1; done' \
            x11vnc-loop "${display}" "${rfb_port}" &
        slot_pids="${slot_pids} $!"
        websockify "127.0.0.1:${ws_port}" "127.0.0.1:${rfb_port}" &
        slot_pids="${slot_pids} $!"
    elif command -v docker >/dev/null && docker image inspect "${SW_VNC_SIDECAR_IMAGE:-sw-android-vnc-sidecar}" >/dev/null 2>&1; then
        echo "[slot ${SW_ENVIRONMENT_ID}] vnc: sidecar container (no X stack on this machine), ws :${ws_port}, ${geometry}"
        # Looped like the native pipeline; a stale container from a previous life is removed first.
        SW_VNC_CONTAINER="sw-vnc-${SW_ENVIRONMENT_ID}" SW_VNC_WS_PORT="${ws_port}" SW_VNC_GEOMETRY="${geometry}" \
        SW_ADB_TARGET="host.docker.internal:$((SW_CONSOLE_PORT + 1))" \
        SW_VNC_SIDECAR_IMAGE="${SW_VNC_SIDECAR_IMAGE:-sw-android-vnc-sidecar}" bash -c '
while true; do
    docker rm -f "${SW_VNC_CONTAINER}" >/dev/null 2>&1 || true
    docker run --rm --name "${SW_VNC_CONTAINER}" -p "127.0.0.1:${SW_VNC_WS_PORT}:7900" \
        -e SW_ADB_TARGET -e SW_VNC_GEOMETRY "${SW_VNC_SIDECAR_IMAGE}"
    sleep 3
done' &
        slot_pids="${slot_pids} $!"
    else
        echo "[slot ${SW_ENVIRONMENT_ID}] vnc: neither the X stack (Xvfb/x11vnc/websockify/scrcpy) nor the sidecar image on this machine — no VNC for this seat"
    fi
}

# ---------------------------------------------------------------- slot mode
# Environment (set by the agent when spawning): SW_ENVIRONMENT_ID, SW_AVD (the baked base AVD of the
# Android version), SW_DEVICE (the device kind to dress it as), SW_WD_PORT, SW_APPIUM_PORT,
# SW_CONSOLE_PORT, SW_VNC_PORT, SW_ENV_AGENT_TOKEN, SW_INTERNAL_URL, SW_HOST_IP, SW_SLOT_DIR,
# SW_SESSION_IDLE_TIMEOUT_SECONDS, SW_APPS.
run_slot() {
    : "${SW_ENVIRONMENT_ID:?}" "${SW_AVD:?}" "${SW_DEVICE:?}" "${SW_WD_PORT:?}" "${SW_APPIUM_PORT:?}" "${SW_VNC_PORT:?}"
    : "${SW_CONSOLE_PORT:?}" "${SW_ENV_AGENT_TOKEN:?}" "${SW_INTERNAL_URL:?}" "${SW_HOST_IP:?}" "${SW_SLOT_DIR:?}"

    mkdir -p "${SW_SLOT_DIR}"
    cd "${SW_SLOT_DIR}"

    # Everything the slot prints lands in one file — the same "session log = slice of the node log"
    # contract the docker environments use.
    exec >>"${SW_SLOT_DIR}/session.log" 2>&1

    # The SDK location, exported so Appium/adb find it regardless of how the agent was launched (the
    # golden metal image sets this globally; a dev Mac may not). SDK tools go on PATH for the same reason.
    export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
    export ANDROID_SDK_ROOT="${ANDROID_HOME}"
    export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

    emulator_bin="${ANDROID_HOME}/emulator/emulator"
    serial="emulator-${SW_CONSOLE_PORT}"

    # The AVD this seat boots: the base AVD of the version, dressed as the requested device kind. One
    # AVD per (version, kind) — derived on first use from the base's system image and the emulator's
    # own device definition (`pixel-7` -> `pixel_7`), so the golden image bakes one AVD per version only.
    avd_name="${SW_AVD}-${SW_DEVICE}"
    ensure_device_avd "${SW_AVD}" "${SW_DEVICE}" "${avd_name}" || exit 1

    slot_pids=""

    # Software rendering (SwiftShader): a metal host is headless and the agent may be a daemon with no
    # GPU/WindowServer, where hardware/auto GPU probes "UNKNOWN" and the emulator crashes. SwiftShader
    # needs neither and still renders (headless or into a window). Override with SW_EMULATOR_GPU.
    gpu_mode="${SW_EMULATOR_GPU:-swiftshader_indirect}"

    # Headless by default (a metal host has no display); local dev sets SW_EMULATOR_WINDOW=1 to watch
    # the emulator in a native window — which only works when the agent runs in a desktop session (your
    # Terminal), not when the control plane auto-started it as a daemon (no WindowServer). The viewer's
    # picture is the slot's own VNC pipeline, independent of this window.
    window_flag="-no-window"
    [ "${SW_EMULATOR_WINDOW:-}" = "1" ] && window_flag=""

    echo "[slot ${SW_ENVIRONMENT_ID}] starting emulator ${avd_name} on console ${SW_CONSOLE_PORT} (gpu ${gpu_mode})"
    # -read-only lets N instances share one AVD; the console port pins the adb serial to this slot.
    "${emulator_bin}" -avd "${avd_name}" -port "${SW_CONSOLE_PORT}" -read-only \
        -gpu "${gpu_mode}" -no-audio -no-boot-anim -no-snapshot ${window_flag} &
    slot_pids="${slot_pids} $!"

    adb start-server >/dev/null 2>&1 || true
    adb -s "${serial}" wait-for-device
    for _ in $(seq 1 120); do
        if [ "$(adb -s "${serial}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
            echo "[slot ${SW_ENVIRONMENT_ID}] android booted"
            break
        fi
        sleep 3
    done

    # The seat's applications: a build with an artifact is pulled through the control plane (the slot
    # holds no storage credentials), its honest identity detected from the APK manifest BEFORE the
    # install (aapt2 ships with the SDK build-tools), then installed; a preinstalled one is looked up on
    # the device by its word (the package whose last segment is the word) and reported from there; a
    # paired webdriver (a browser's chromedriver, for Appium on THIS host) is staged either way. The
    # detected identities ride the environment agent's registration heartbeat.
    detected_file="${SW_SLOT_DIR}/detected.json"
    echo "[]" >"${detected_file}"
    chromedriver_path=""
    aapt2_bin="$(ls "${ANDROID_HOME}"/build-tools/*/aapt2 2>/dev/null | sort | tail -1)"

    for app_entry in $(echo "${SW_APPS:-}" | tr ',' ' '); do
        IFS='~' read -r app_name has_app wants_webdriver <<<"${app_entry}"
        detected_name=""
        detected_version=""

        if [ "${has_app}" = "1" ]; then
            apk_file="${SW_SLOT_DIR}/${app_name}.apk"

            echo "[slot ${SW_ENVIRONMENT_ID}] delivering ${app_name}"
            for _ in $(seq 1 3); do
                curl -sf -H "Authorization: Bearer ${SW_ENV_AGENT_TOKEN}" \
                    "${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}/applications/${app_name}:downloadApp" \
                    -o "${apk_file}" && break
                sleep 2
            done

            if [ ! -s "${apk_file}" ]; then
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: artifact download failed — stopping the slot"
                kill 0
            fi

            if [ -n "${aapt2_bin}" ]; then
                badging="$("${aapt2_bin}" dump badging "${apk_file}" 2>/dev/null | head -1)"
                detected_name="$(echo "${badging}" | sed -n "s/.*package: name='\([^']*\)'.*/\1/p")"
                detected_version="$(echo "${badging}" | sed -n "s/.*versionName='\([^']*\)'.*/\1/p")"
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: detected ${detected_name:-?} ${detected_version:-?}"
            else
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: no aapt2 in build-tools — installing undetected"
            fi

            if ! adb -s "${serial}" install -r "${apk_file}"; then
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: adb install failed — stopping the slot"
                kill 0
            fi
        else
            package="$(adb -s "${serial}" shell pm list packages 2>/dev/null | tr -d '\r' \
                | sed 's/^package://' | grep -E "\.${app_name}\$" | head -1)"
            if [ -n "${package}" ]; then
                detected_name="${package}"
                detected_version="$(adb -s "${serial}" shell dumpsys package "${package}" 2>/dev/null | tr -d '\r' \
                    | sed -n 's/^ *versionName=//p' | head -1)"
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: preinstalled ${detected_name} ${detected_version:-?}"
            else
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: no preinstalled package answers to the word — undetected"
            fi
        fi

        node -e '
const fs = require("fs");
const [file, nameAlias, name, version] = process.argv.slice(1);
const reports = JSON.parse(fs.readFileSync(file, "utf8"));
reports.push({
    nameAlias,
    ...(name ? { name } : {}),
    ...(version ? { version } : {}),
});
fs.writeFileSync(file, JSON.stringify(reports));
' "${detected_file}" "${app_name}" "${detected_name}" "${detected_version}"

        if [ "${wants_webdriver}" = "1" ]; then
            driver_download="${SW_SLOT_DIR}/webdriver-${app_name}.artifact"
            for _ in $(seq 1 3); do
                curl -sf -H "Authorization: Bearer ${SW_ENV_AGENT_TOKEN}" \
                    "${SW_INTERNAL_URL}/internal/environments/${SW_ENVIRONMENT_ID}/applications/${app_name}:downloadWebdriver" \
                    -o "${driver_download}" && break
                sleep 2
            done
            driver_file="$(stage_webdriver "${driver_download}" "${SW_SLOT_DIR}/webdriver-${app_name}")"
            if [ -z "${driver_file}" ]; then
                echo "[slot ${SW_ENVIRONMENT_ID}] ${app_name}: webdriver download failed — stopping the slot"
                kill 0
            fi
            # One webdriver per slot: Appium runs one chromedriver binary; the first browser-like app wins.
            [ -z "${chromedriver_path}" ] && chromedriver_path="${driver_file}"
        fi
    done

    # Appium is pinned to this slot's emulator via default capabilities — several emulators share one
    # adb server, so the udid is not optional here (unlike the single-device redroid node). A delivered
    # webdriver (a browser-like build's paired chromedriver) is handed over the same way.
    default_caps="{\"appium:udid\":\"${serial}\",\"platformName\":\"Android\",\"appium:automationName\":\"UiAutomator2\""
    if [ -n "${chromedriver_path}" ]; then
        default_caps="${default_caps},\"appium:chromedriverExecutable\":\"${chromedriver_path}\""
    fi
    default_caps="${default_caps}}"

    appium --address 127.0.0.1 --port "${SW_APPIUM_PORT}" --base-path / --relaxed-security \
        --default-capabilities "${default_caps}" &
    slot_pids="${slot_pids} $!"
    # The door reports ready the moment it listens, and the environment registers on that — so Appium
    # must already answer, or the first session lands on a closed port.
    for _ in $(seq 1 120); do
        curl -sf "http://127.0.0.1:${SW_APPIUM_PORT}/status" >/dev/null 2>&1 && break
        sleep 1
    done

    vnc_ws_port=$((SW_VNC_PORT + vnc_ws_offset))
    start_vnc "${serial}" "${SW_VNC_PORT}" "${vnc_ws_port}"

    # The slot's wd door — the same door a linux node runs, fetched from the control plane, in its
    # Appium dialect: the Grid-shaped /status the heartbeat agent reads for readiness and busy, the
    # one-session rule, the idle timeout, and the /se/vnc route to this slot's bridge (cut on session
    # end). Busy is tracked by watching the proxied traffic, never by asking Appium.
    if ! fetch_internal "wdDoor:download" "${SW_SLOT_DIR}/wd-door.js"; then
        echo "[slot ${SW_ENVIRONMENT_ID}] wd door download failed — stopping the slot"
        kill 0
    fi
    SW_DOOR_PORT="${SW_WD_PORT}" SW_DOOR_UPSTREAM_PORT="${SW_APPIUM_PORT}" SW_DOOR_DRIVER=appium \
    SW_DOOR_VNC_WS_PORT="${vnc_ws_port}" SW_DOOR_IDLE_TIMEOUT_SECONDS="${SW_SESSION_IDLE_TIMEOUT_SECONDS:-}" \
        node "${SW_SLOT_DIR}/wd-door.js" &
    slot_pids="${slot_pids} $!"

    # The stock environment heartbeat agent, fetched from the control plane (never baked anywhere):
    # registers the environment at this slot's endpoint and keeps its liveness/busy word fresh. Session
    # video is the device's own stream, recorded by scrcpy off this slot's adb serial — no display
    # involved, so it works wherever scrcpy does (a linux host, a dev Mac, a real device).
    if ! fetch_internal "agentScript:download" "${SW_SLOT_DIR}/heartbeat-agent.sh"; then
        echo "[slot ${SW_ENVIRONMENT_ID}] heartbeat agent download failed — stopping the slot"
        kill 0
    fi

    SW_INTERNAL_TOKEN="${SW_ENV_AGENT_TOKEN}" \
    SW_ENDPOINT="http://${SW_HOST_IP}:${SW_WD_PORT}" \
    SW_NODE_URL="http://127.0.0.1:${SW_WD_PORT}" \
    SW_SESSION_LOG_GLOB="${SW_SLOT_DIR}/session.log" \
    SW_DETECTED_APPS_FILE="${detected_file}" \
    SW_VNC_RFB_PORT="${SW_VNC_PORT}" \
    SW_VIDEO_RECORDER=scrcpy \
    SW_ADB_SERIAL="${serial}" \
        bash "${SW_SLOT_DIR}/heartbeat-agent.sh" &
    slot_pids="${slot_pids} $!"

    # Supervise: the first casualty takes the whole slot down (process group), and the agent's next
    # tick starts it afresh while the seat is still desired. A poll, not `wait -n` — macOS ships
    # bash 3.2 and `wait -n` needs 4.3.
    while true; do
        for pid in ${slot_pids}; do
            if ! kill -0 "${pid}" 2>/dev/null; then
                echo "[slot ${SW_ENVIRONMENT_ID}] a slot process died — stopping the slot"
                adb -s "${serial}" emu kill >/dev/null 2>&1 || true
                kill 0
            fi
        done
        sleep 3
    done
}

# ---------------------------------------------------------------- agent mode
agent_version="1"

# What this box is: cores, memory, how it can run guests, what is installed. Reported verbatim on every
# sync — the control plane judges fitness and capacity from it, the agent only observes.
collect_facts() {
    local cores memory_mb virtualization emulator avds docker vnc_stack address
    if command -v nproc >/dev/null 2>&1; then cores="$(nproc)"; else cores="$(sysctl -n hw.ncpu 2>/dev/null || echo 1)"; fi
    if [ -r /proc/meminfo ]; then
        memory_mb="$(awk '/MemTotal/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
    else
        memory_mb="$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 ))"
    fi
    if [ -e /dev/kvm ]; then virtualization=kvm
    elif [ "$(uname -s)" = "Darwin" ]; then virtualization=hvf
    else virtualization=none
    fi
    local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
    if [ -x "${sdk}/emulator/emulator" ]; then emulator=true; else emulator=false; fi
    avds=""
    if [ "${emulator}" = "true" ]; then
        avds="$("${sdk}/emulator/emulator" -list-avds 2>/dev/null | grep -v "^INFO" | tr -d '\r' | tr '\n' ',')"
    fi
    if command -v docker >/dev/null 2>&1; then docker=true; else docker=false; fi
    if has_vnc_stack || { command -v docker >/dev/null 2>&1 && docker image inspect "${SW_VNC_SIDECAR_IMAGE:-sw-android-vnc-sidecar}" >/dev/null 2>&1; }; then
        vnc_stack=true
    else
        vnc_stack=false
    fi
    address="${SW_HOST_IP:-$(detect_host_ip)}"

    node -e '
const [cores, memoryMb, virtualization, emulator, avds, docker, vncStack, agentVersion, address] = process.argv.slice(1);
process.stdout.write(JSON.stringify({
    cores: Number(cores) || 1,
    memoryMb: Number(memoryMb) || null,
    virtualization,
    emulator: emulator === "true",
    avds: avds.split(",").filter(Boolean),
    docker: docker === "true",
    vncStack: vncStack === "true",
    agentVersion,
    address: address || null,
}));
' "${cores}" "${memory_mb}" "${virtualization}" "${emulator}" "${avds}" "${docker}" "${vnc_stack}" "${agent_version}" "${address}"
}

# The slots this agent observes running — for the control plane's record; the desired set in its
# answer is what the agent converges to.
observed_slots() {
    local state_dir="$1" slot_dir env_id first=1
    printf '['
    for slot_dir in "${state_dir}"/slots/*/; do
        [ -d "${slot_dir}" ] || continue
        env_id="$(basename "${slot_dir}")"
        if [ -f "${slot_dir}/pgid" ] && kill -0 "$(cat "${slot_dir}/pgid")" 2>/dev/null; then
            [ "${first}" = "1" ] || printf ','
            printf '{"environmentId":"%s","state":"running"}' "${env_id}"
            first=0
        fi
    done
    printf ']'
}

run_agent() {
    : "${SW_MACHINE_ID:?SW_MACHINE_ID is required}"
    : "${SW_MACHINE_TOKEN:?SW_MACHINE_TOKEN is required}"
    : "${SW_INTERNAL_URL:?SW_INTERNAL_URL is required}"

    interval="${SW_SYNC_INTERVAL_SECONDS:-3}"
    state_dir="${SW_STATE_DIR:-/tmp/sw-machine/${SW_MACHINE_ID}}"
    mkdir -p "${state_dir}"

    # Where sessions reach this machine's slots: the address the control plane knows the machine by
    # (the FQDN the operator attached it under) — what the sync answers with; until then, our own guess.
    host_ip="${SW_HOST_IP:-$(detect_host_ip)}"
    sync_url="${SW_INTERNAL_URL}/internal/machines/${SW_MACHINE_ID}:sync"

    echo "[machine-agent ${SW_MACHINE_ID}] agent up (v${agent_version}), reporting ${host_ip}, state in ${state_dir}"

    while true; do
        body="{\"facts\":$(collect_facts),\"slots\":$(observed_slots "${state_dir}")}"
        response_file="${state_dir}/sync.json"
        status=$(curl -s -o "${response_file}" -w "%{http_code}" -X POST \
            -H "Authorization: Bearer ${SW_MACHINE_TOKEN}" -H "content-type: application/json" \
            -d "${body}" "${sync_url}" || echo "000")

        if [ "${status}" = "404" ]; then
            # The machine is unknown to the control plane (detached) — self-fence.
            echo "[machine-agent ${SW_MACHINE_ID}] 404 from the control plane — stopping every slot and exiting"
            for pid_file in "${state_dir}"/slots/*/pgid; do
                [ -f "${pid_file}" ] && stop_slot "$(dirname "${pid_file}")"
            done
            exit 0
        fi

        if [ "${status}" = "200" ]; then
            reconcile "${response_file}" "${state_dir}" "${host_ip}"
        else
            echo "[machine-agent ${SW_MACHINE_ID}] sync failed (${status}), retrying"
        fi

        sleep "${interval}"
    done
}

# Converge running slots to the desired set from the last sync answer.
reconcile() {
    response_file="$1"; state_dir="$2"; host_ip="$3"
    slots_dir="${state_dir}/slots"
    mkdir -p "${slots_dir}"

    # One line per desired seat: envId wd appium console vnc avd device internalUrl token idleTimeout apps.
    # Parsed with node — already a hard dependency of every slot (the wd door and Appium are node), so
    # the agent needs no second runtime (macOS no longer ships python3). apps encodes the launch's
    # application list as name~appFlag~webdriverFlag entries (the separators are outside the
    # application-name alphabet). No field but the last may be empty: `read` folds adjacent tabs.
    desired_file="${state_dir}/desired.tsv"
    node -e '
const doc = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
for (const s of doc.assignments || []) {
    const l = s.launch || {}, p = s.ports || {};
    const apps = (l.apps || []).map((a) => `${a.name}~${a.app ? 1 : 0}~${a.webdriver ? 1 : 0}`).join(",");
    process.stdout.write([
        s.environmentId, p.wd, p.appium, p.console, p.vnc, l.avd || "", l.device || "", l.internalUrl || "",
        s.agentToken, l.sessionTimeoutSeconds || 0, apps,
    ].join("\t") + "\n");
}
' "$response_file" >"${desired_file}"

    # Stop slots that are no longer desired.
    for slot_dir in "${slots_dir}"/*/; do
        [ -d "${slot_dir}" ] || continue
        env_id="$(basename "${slot_dir}")"
        if ! cut -f1 "${desired_file}" | grep -qx "${env_id}"; then
            echo "[machine-agent] seat ${env_id} no longer desired — stopping its slot"
            stop_slot "${slot_dir}"
        fi
    done

    # Start (or restart after a crash) every desired slot that is not running.
    while IFS=$'\t' read -r env_id wd appium console vnc avd device internal_url token idle_timeout apps; do
        [ -n "${env_id}" ] || continue
        slot_dir="${slots_dir}/${env_id}"

        # The pgid file holds the slot leader's pid (== its process-group id, since it is a session
        # leader). A positive kill -0 on the leader is the portable liveness probe (bash 3.2 on macOS
        # mishandles the negative process-group form).
        if [ -f "${slot_dir}/pgid" ] && kill -0 "$(cat "${slot_dir}/pgid")" 2>/dev/null; then
            continue
        fi

        echo "[machine-agent] starting slot for ${env_id} (wd :${wd}, avd ${avd} as ${device})"
        mkdir -p "${slot_dir}"
        # Spawn the slot in its own session (its own process group), so the whole slot dies as one and
        # nothing it starts is orphaned onto the agent. node stands in for setsid (macOS ships neither
        # setsid nor a reliable python3); `detached` = a fresh session, `stdio: ignore` frees the
        # agent's fds (no pipe to hang on), and the printed leader pid IS the group id.
        SW_ENVIRONMENT_ID="${env_id}" SW_AVD="${avd}" SW_DEVICE="${device}" SW_WD_PORT="${wd}" SW_APPIUM_PORT="${appium}" \
        SW_CONSOLE_PORT="${console}" SW_VNC_PORT="${vnc}" SW_ENV_AGENT_TOKEN="${token}" SW_INTERNAL_URL="${internal_url}" \
        SW_HOST_IP="${host_ip}" SW_SLOT_DIR="${slot_dir}" SW_SESSION_IDLE_TIMEOUT_SECONDS="${idle_timeout}" SW_APPS="${apps:-}" \
            node -e 'const c=require("child_process").spawn("bash",[process.argv[1],"slot"],{detached:true,stdio:"ignore"});console.log(c.pid);c.unref();' \
            "$0" >"${slot_dir}/pgid"
    done <"${desired_file}"
}

stop_slot() {
    slot_dir="$1"
    if [ -f "${slot_dir}/pgid" ]; then
        pgid="$(cat "${slot_dir}/pgid")"
        # The whole slot is one process group; the external kill takes the negative-pgid form
        # reliably where the bash 3.2 builtin does not.
        /bin/kill -TERM "-${pgid}" 2>/dev/null || true
        sleep 2
        /bin/kill -KILL "-${pgid}" 2>/dev/null || true
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
