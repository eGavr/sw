#!/bin/bash
# Golden-image boot script for an on-demand browser Compute VM. Baked into the image and run once at boot
# by sw-browser-boot.service. It reads the per-environment parameters the compute adapter passes as VM
# metadata attributes and brings up the selenium node container with the heartbeat agent injected — the
# exact same container + agentBootstrap the local docker adapter runs on the operator's machine, just on
# a dedicated VM. The adapter never SSHes in — everything is metadata-driven.
set -x
exec > /var/log/sw-browser-boot.log 2>&1

metadata="http://169.254.169.254/computeMetadata/v1/instance/attributes"
header="Metadata-Flavor: Google"
attribute() { curl -s -H "${header}" "${metadata}/$1"; }

environment_id=$(attribute sw-environment-id)
node_image=$(attribute sw-node-image)
session_timeout=$(attribute sw-session-timeout); session_timeout=${session_timeout:-300}
internal_url=$(attribute sw-internal-url)
internal_token=$(attribute sw-internal-token)
# The endpoint the control plane routes WebDriver traffic to is this VM's own private IP — always derived
# here, since the adapter cannot know the IP before the VM exists.
internal_ip=$(curl -s -H "${header}" "http://169.254.169.254/computeMetadata/v1/instance/network-interfaces/0/ip")
endpoint="http://${internal_ip}:4444"

docker rm -f sw-node 2>/dev/null

# The stock selenium entrypoint, wrapped by the agent bootstrap: fetch the heartbeat agent from the
# control plane and run it in the background, mirror stdout into the session-log file the agent slices,
# then exec the normal entrypoint as PID 1 — byte-for-byte the scheme of the local docker adapter.
docker run -d --name sw-node --restart unless-stopped -p 4444:4444 --shm-size 2g \
    -e SW_ENVIRONMENT_ID="${environment_id}" \
    -e SW_ENDPOINT="${endpoint}" \
    -e SW_INTERNAL_URL="${internal_url}" \
    -e SW_INTERNAL_TOKEN="${internal_token}" \
    -e SW_SESSION_LOG_GLOB="/tmp/sw-session.log" \
    -e SE_NODE_SESSION_TIMEOUT="${session_timeout}" \
    -e SE_NODE_MAX_SESSIONS=1 \
    -e SE_NODE_OVERRIDE_MAX_SESSIONS=true \
    --entrypoint bash "${node_image}" -c '
        for attempt in 1 2 3 4 5; do
            curl -fsSL -H "Authorization: Bearer $SW_INTERNAL_TOKEN" \
                "$SW_INTERNAL_URL/internal/agentScript:download" -o /tmp/sw-agent.sh && break
            sleep 2
        done
        bash /tmp/sw-agent.sh &
        touch /tmp/sw-session.log
        tail -n +1 -F /tmp/sw-session.log 2>/dev/null &
        exec /opt/bin/entry_point.sh >>/tmp/sw-session.log 2>&1
    '
