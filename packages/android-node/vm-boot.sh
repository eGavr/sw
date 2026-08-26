#!/bin/bash
# Golden-image boot script for an on-demand Android Compute VM. Baked into the image and run once at boot
# by sw-android-boot.service. It reads the per-environment parameters the compute adapter passes as VM
# metadata attributes, loads the binder kernel module, and brings up the environment as two containers:
# a privileged redroid of the requested Android version and the companion node (with the heartbeat agent
# injected, exactly like the browser nodes). The adapter never SSHes in — everything is metadata-driven.
set -x
exec > /var/log/sw-android-boot.log 2>&1

metadata="http://169.254.169.254/computeMetadata/v1/instance/attributes"
header="Metadata-Flavor: Google"
attribute() { curl -s -H "${header}" "${metadata}/$1"; }

environment_id=$(attribute sw-environment-id)
redroid_tag=$(attribute sw-redroid-tag); redroid_tag=${redroid_tag:-11.0.0-latest}
internal_url=$(attribute sw-internal-url)
internal_token=$(attribute sw-internal-token)
# The endpoint the control plane routes WebDriver traffic to is this VM's own private IP — always derived
# here, since the adapter cannot know the IP before the VM exists (a missing sw-endpoint attribute comes
# back as the literal "Not Found" from the metadata service, so it can't be used as an override).
internal_ip=$(curl -s -H "${header}" "http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/ip")
endpoint="http://${internal_ip}:4444"

modprobe binder_linux devices="binder,hwbinder,vndbinder" || modprobe binder_linux

docker rm -f sw-redroid sw-node 2>/dev/null

# redroid owns the shared network namespace, so it publishes the companion's node port.
docker run -d --name sw-redroid --restart unless-stopped --privileged -p 4444:4444 \
    "redroid/redroid:${redroid_tag}" \
    androidboot.redroid_width=720 androidboot.redroid_height=1280 androidboot.redroid_dpi=320

# Companion node sharing redroid's netns, with the heartbeat agent fetched from the control plane at
# startup (agentBootstrap) and run alongside the node's start script.
docker run -d --name sw-node --restart unless-stopped --network "container:sw-redroid" \
    -e SW_ENVIRONMENT_ID="${environment_id}" \
    -e SW_ENDPOINT="${endpoint}" \
    -e SW_INTERNAL_URL="${internal_url}" \
    -e SW_INTERNAL_TOKEN="${internal_token}" \
    -e SW_SESSION_LOG_GLOB="/tmp/sw-session.log" \
    -e REDROID_ADDR="127.0.0.1:5555" \
    --entrypoint bash sw/android-node:latest -c '
        for attempt in 1 2 3 4 5; do
            curl -fsSL -H "Authorization: Bearer $SW_INTERNAL_TOKEN" \
                "$SW_INTERNAL_URL/internal/agentScript:download" -o /tmp/sw-agent.sh && break
            sleep 2
        done
        bash /tmp/sw-agent.sh &
        touch /tmp/sw-session.log
        tail -n +1 -F /tmp/sw-session.log 2>/dev/null &
        exec /opt/android-node/start.sh >>/tmp/sw-session.log 2>&1
    '
