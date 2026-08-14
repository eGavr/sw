#!/bin/bash
# Entrypoint of the Android companion node. It shares the redroid container's network namespace, so the
# device's adb is reachable on localhost:5555. It waits for Android to finish booting, starts Appium (the
# WebDriver server driving the device) and the Selenium-Grid /status shim, then execs nginx as the single
# node surface on :4444. The heartbeat agent is layered on top by the container command (agentBootstrap),
# not here.
#
# Follow-up: the interactive VNC pipeline (scrcpy -> Xvfb -> x11vnc -> websockify) is not started here yet
# — it needs extra packages (scrcpy et al.) in the image; see README. Until then /session/{id}/se/vnc 502s.
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

sleep 8
echo "[android-node] nginx surface on :4444"
exec nginx -c /opt/android-node/nginx.conf -g "daemon off;"
