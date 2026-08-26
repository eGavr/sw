#!/bin/bash
# Golden-image boot script for an on-demand Android *emulator* Compute VM. Baked into the image and run once
# at boot by sw-android-emulator-boot.service. It reads the per-environment parameters the compute adapter
# passes as VM metadata, verifies /dev/kvm is present (the official QEMU emulator needs hardware
# acceleration — without it a cold boot takes minutes and is unusable), starts the requested AVD headless,
# then runs the SAME companion the redroid path uses (Appium + the Selenium-Grid /status shim + nginx on
# :4444, with the heartbeat agent fetched from the control plane). The adapter never SSHes in — everything
# is metadata-driven. Only /dev/kvm and the Android SDK are host specific; the companion is identical to the
# container path (packages/android-node), so this runs on any KVM host, not just YC.
set -x
exec > /var/log/sw-android-emulator-boot.log 2>&1

metadata="http://169.254.169.254/computeMetadata/v1/instance/attributes"
header="Metadata-Flavor: Google"
attribute() { curl -s -H "${header}" "${metadata}/$1"; }

environment_id=$(attribute sw-environment-id)
# The AVD to boot, named by convention sw-android-<version>; must be one baked into this image.
avd=$(attribute sw-android-avd); avd=${avd:-sw-android-34}
internal_url=$(attribute sw-internal-url)
internal_token=$(attribute sw-internal-token)
# The endpoint the control plane routes WebDriver traffic to is this VM's own private IP — derived here,
# since the adapter cannot know the IP before the VM exists (like the redroid path).
internal_ip=$(curl -s -H "${header}" "http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/ip")
endpoint="http://${internal_ip}:4444"

# The emulator needs KVM. Fail loudly instead of limping on a software renderer: the VM stays unregistered
# and the reaper reclaims it, surfacing a provisioning failure rather than a mysteriously slow environment.
if [ ! -e /dev/kvm ]; then
    echo "FATAL: /dev/kvm missing — this VM's platform does not expose hardware virtualization"
    exit 1
fi

export ANDROID_HOME=/opt/android-sdk
export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator:${PATH}"

# Headless, KVM-accelerated; no window/audio/boot-anim/snapshot. adb comes up on 127.0.0.1:5555. Runs on
# the host (not a container) so the emulator and the companion's Appium share one adb server.
nohup emulator -avd "${avd}" -no-window -no-audio -no-boot-anim -no-snapshot \
    -gpu swiftshader_indirect -accel on -read-only >/var/log/sw-emulator.log 2>&1 &

# Fetch the heartbeat agent from the control plane (same agentBootstrap contract as every other node) and
# run it alongside the companion; SW_* env is what the agent and the /status shim read.
export SW_ENVIRONMENT_ID="${environment_id}"
export SW_ENDPOINT="${endpoint}"
export SW_INTERNAL_URL="${internal_url}"
export SW_INTERNAL_TOKEN="${internal_token}"
export SW_SESSION_LOG_GLOB="/tmp/sw-session.log"
export REDROID_ADDR="127.0.0.1:5555"

for _ in 1 2 3 4 5; do
    curl -fsSL -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
        "${SW_INTERNAL_URL}/internal/agentScript:download" -o /tmp/sw-agent.sh && break
    sleep 2
done

bash /tmp/sw-agent.sh &
touch /tmp/sw-session.log
tail -n +1 -F /tmp/sw-session.log 2>/dev/null &

# The companion (Appium + /status shim + nginx on :4444) is copied from packages/android-node into the
# golden image; it waits for sys.boot_completed, so it tolerates the emulator still booting here.
exec /opt/android-node/start.sh >>/tmp/sw-session.log 2>&1
