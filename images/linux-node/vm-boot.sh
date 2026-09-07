#!/bin/bash
# Golden-image boot script for an on-demand browser Compute VM. Baked into the image and run once at boot
# by sw-browser-boot.service. It reads the per-environment parameters the compute adapter passes as VM
# metadata attributes and brings up the linux base image with the heartbeat agent injected — the exact
# same container + agentBootstrap the local docker adapter runs on the operator's machine, just on a
# dedicated VM. The node script, the wd door and the browser itself arrive from the control plane once
# the container starts. The adapter never SSHes in — everything is metadata-driven.
set -x
exec > /var/log/sw-browser-boot.log 2>&1

metadata="http://169.254.169.254/computeMetadata/v1/instance/attributes"
header="Metadata-Flavor: Google"
attribute() { curl -s -H "${header}" "${metadata}/$1"; }

environment_id=$(attribute sw-environment-id)
base_image=$(attribute sw-base-image)
apps=$(attribute sw-apps)
detected_file=$(attribute sw-detected-apps-file); detected_file=${detected_file:-/tmp/sw-detected.json}
idle_timeout=$(attribute sw-idle-timeout); idle_timeout=${idle_timeout:-300}
screen_width=$(attribute sw-screen-width); screen_width=${screen_width:-1360}
screen_height=$(attribute sw-screen-height); screen_height=${screen_height:-1020}
internal_url=$(attribute sw-internal-url)
internal_token=$(attribute sw-internal-token)
# The endpoint the control plane routes WebDriver traffic to is this VM's own private IP — always derived
# here, since the adapter cannot know the IP before the VM exists.
internal_ip=$(curl -s -H "${header}" "http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/ip")
endpoint="http://${internal_ip}:4444"

docker rm -f sw-node 2>/dev/null

# The image's bootstrap, wrapped by the agent bootstrap: fetch the heartbeat agent from the control
# plane and run it in the background, mirror stdout into the session-log file the agent slices, then
# exec the bootstrap as PID 1 — byte-for-byte the scheme of the local docker adapter.
docker run -d --name sw-node --restart unless-stopped -p 4444:4444 --shm-size 2g \
    -e SW_ENVIRONMENT_ID="${environment_id}" \
    -e SW_ENDPOINT="${endpoint}" \
    -e SW_INTERNAL_URL="${internal_url}" \
    -e SW_INTERNAL_TOKEN="${internal_token}" \
    -e SW_SESSION_LOG_GLOB="/tmp/sw-session.log" \
    -e SW_APPS="${apps}" \
    -e SW_DETECTED_APPS_FILE="${detected_file}" \
    -e SW_SESSION_IDLE_TIMEOUT_SECONDS="${idle_timeout}" \
    -e SW_SCREEN_WIDTH="${screen_width}" \
    -e SW_SCREEN_HEIGHT="${screen_height}" \
    --entrypoint bash "${base_image}" -c '
        for attempt in 1 2 3 4 5; do
            curl -fsSL -H "Authorization: Bearer $SW_INTERNAL_TOKEN" \
                "$SW_INTERNAL_URL/internal/agentScript:download" -o /tmp/sw-agent.sh && break
            sleep 2
        done
        bash /tmp/sw-agent.sh &
        touch /tmp/sw-session.log
        tail -n +1 -F /tmp/sw-session.log 2>/dev/null &
        exec /opt/sw/bootstrap.sh >>/tmp/sw-session.log 2>&1
    '
