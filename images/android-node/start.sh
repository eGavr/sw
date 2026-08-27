#!/bin/bash
# Entrypoint of the Android companion node. It shares the redroid container's network namespace, so the
# device's adb is reachable on localhost:5555. It waits for Android to finish booting, starts Appium (the
# WebDriver server driving the device) and the Selenium-Grid /status shim, then execs nginx as the single
# node surface on :4444. The heartbeat agent is layered on top by the container command (agentBootstrap),
# not here.
#
# It also brings up the interactive VNC pipeline: scrcpy mirrors the device onto a virtual X display (Xvfb)
# and injects input back into it, x11vnc exports it over VNC, websockify bridges VNC to WebSocket; nginx
# routes /session/*/se/vnc there so the hosted noVNC viewer can watch and drive the session.
set -e

export ANDROID_HOME=/opt/android-sdk
export PATH="$ANDROID_HOME/platform-tools:$PATH"

REDROID="${REDROID_ADDR:-127.0.0.1:5555}"

echo "[android-node] connecting adb -> ${REDROID}"
adb start-server
for _ in $(seq 1 100); do
    adb connect "${REDROID}" >/dev/null 2>&1
    if [ "$(adb -s "${REDROID}" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
        echo "[android-node] android booted"
        break
    fi
    sleep 3
done

appium --address 127.0.0.1 --port 4723 --base-path / --relaxed-security >/tmp/appium.log 2>&1 &
node /opt/android-node/status-shim.js >/tmp/status-shim.log 2>&1 &

# Interactive VNC pipeline. scrcpy renders into a headless X display (Xvfb) under a minimal window manager
# (openbox, so its window keeps input focus for keyboard control); x11vnc exports that display (no password —
# access is gated by possession of the unguessable session id); websockify bridges it to WebSocket on 7900,
# where nginx forwards /session/*/se/vnc. Geometry defaults to the redroid device size and is overridable.
export DISPLAY=:99
GEOMETRY="${SW_VNC_GEOMETRY:-720x1280x24}"
Xvfb :99 -screen 0 "${GEOMETRY}" -nolisten tcp >/tmp/xvfb.log 2>&1 &
sleep 2
openbox >/tmp/openbox.log 2>&1 &
LIBGL_ALWAYS_SOFTWARE=1 scrcpy -s "${REDROID}" --fullscreen --stay-awake --no-audio --max-fps=15 \
    >/tmp/scrcpy.log 2>&1 &
x11vnc -display :99 -forever -shared -nopw -rfbport 5900 -bg -quiet -o /tmp/x11vnc.log
websockify 7900 127.0.0.1:5900 >/tmp/websockify.log 2>&1 &

sleep 8
echo "[android-node] nginx surface on :4444"
exec nginx -c /opt/android-node/nginx.conf -g "daemon off;"
