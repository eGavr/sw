#!/usr/bin/env bash
# One slot's VNC pipeline, the same chain the pool-host agent runs natively on a linux host:
# scrcpy mirrors the device onto a headless X display and injects the viewer's input back, x11vnc
# exports the display, websockify bridges it to the WebSocket the slot's door routes /se/vnc to.
# The device is the emulator's adb port on the host (SW_ADB_TARGET), attached with this container's own
# adb server — never the host's, whose client version this image cannot promise to match.
set -u

: "${SW_ADB_TARGET:?SW_ADB_TARGET (host:port of the emulator adb socket) is required}"
geometry="${SW_VNC_GEOMETRY:-720x1280}"
width="${geometry%x*}"
height="${geometry#*x}"
long_side=$(( width > height ? width : height ))

log() { echo "[vnc-sidecar] $*"; }

pids=""
spawn() { "$@" & pids="${pids} $!"; }

adb start-server >/dev/null 2>&1
for _ in $(seq 1 60); do
    adb connect "${SW_ADB_TARGET}" 2>/dev/null | grep -q "connected" && break
    sleep 2
done
adb -s "${SW_ADB_TARGET}" wait-for-device
log "attached to ${SW_ADB_TARGET}, ${geometry}"

export DISPLAY=:99
spawn Xvfb "${DISPLAY}" -screen 0 "${geometry}x24" -nolisten tcp -ac
for _ in $(seq 1 50); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.2; done
spawn openbox
# scrcpy exits whenever the device blinks; x11vnc is restarted by design on every session end (a
# viewer must not outlive its session) — both run in restart loops.
spawn env LIBGL_ALWAYS_SOFTWARE=1 SDL_VIDEODRIVER=x11 bash -c \
    'while true; do scrcpy -s "$1" --fullscreen --stay-awake --no-audio --max-fps=15 --max-size="$2"; sleep 2; done' \
    scrcpy-loop "${SW_ADB_TARGET}" "${long_side}"
spawn bash -c 'while true; do x11vnc -display "$1" -forever -shared -nopw -rfbport 5900 -quiet; sleep 1; done' \
    x11vnc-loop "${DISPLAY}"
spawn websockify 0.0.0.0:7900 127.0.0.1:5900

# The first casualty ends the container; the slot's loop starts a fresh one.
trap 'kill 0' TERM INT
while true; do
    for pid in ${pids}; do
        if ! kill -0 "${pid}" 2>/dev/null; then
            log "a pipeline process died — exiting"
            kill 0
        fi
    done
    sleep 3
done
