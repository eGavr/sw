#!/usr/bin/env bash
# The only thing this image knows how to do: fetch the linux node script from the control plane (with
# the per-environment agent token the compute gateway injected) and hand over to it. The script itself
# is never baked, so node behaviour changes ship with the control plane, not with an image rebuild.
set -u

: "${SW_INTERNAL_URL:?SW_INTERNAL_URL is required}"
: "${SW_INTERNAL_TOKEN:?SW_INTERNAL_TOKEN is required}"

for attempt in 1 2 3 4 5; do
    curl -fsSL -H "Authorization: Bearer ${SW_INTERNAL_TOKEN}" \
        "${SW_INTERNAL_URL}/internal/linuxNode:download" -o /tmp/sw-linux-node.sh && break
    echo "[bootstrap] linux node script download failed (attempt ${attempt}); retrying"
    sleep 2
done

exec bash /tmp/sw-linux-node.sh
