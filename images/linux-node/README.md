# linux-node (browser VM golden image)

The golden Compute image for the `yandex-cloud × ubuntu/container` substrate with the `vm` kind: an
on-demand **VM per browser environment**. The VM boots, reads its parameters from instance metadata and
runs the **linux base image with the heartbeat agent injected** — the exact same container + `agentBootstrap`
scheme the local docker adapter uses on the operator's machine, just on a dedicated VM in the (possibly
delegated) folder. The node script, the wd door and the browser (a catalog artifact — chrome and its
chromedriver from Chrome for Testing, or the project's own build) arrive from the control plane once
the container starts; nothing browser-specific is ever baked.

There is no Dockerfile here: the node is `images/linux-base`. The golden is a plain Ubuntu with docker,
the base image **prebaked into the docker cache** (docker hub and our registry may be slow or unreachable
from the RU VMs, and prebaking removes the pull from the boot path), and the boot unit below.

## Contents

- `vm-boot.sh` — reads `sw-environment-id` / `sw-base-image` / `sw-apps` / `sw-detected-apps-file` /
  `sw-idle-timeout` / `sw-screen-width` / `sw-screen-height` / `sw-internal-url` / `sw-internal-token`
  from metadata, derives the endpoint from the VM's own private IP, and runs the base image with the
  agent bootstrap (fetches `/internal/agentScript:download` at startup — the agent is never baked).
- `sw-browser-boot.service` — oneshot systemd unit that runs it at boot.

## Baking the golden (one-time, in YC)

```bash
# 1. A build VM from stock Ubuntu 24.04 (any small preset), then on it:
sudo apt-get update && sudo apt-get install -y docker.io curl
# The base image, prebaked (amd64 — the VM's own arch; built from images/linux-base and pushed to our CR):
sudo docker pull cr.yandex/<registry>/sw-linux-base:24.04
sudo mkdir -p /opt/linux-node
sudo cp vm-boot.sh /opt/linux-node/ && sudo chmod +x /opt/linux-node/vm-boot.sh
sudo cp sw-browser-boot.service /etc/systemd/system/ && sudo systemctl enable sw-browser-boot

# 2. Stop the VM and cut the image:
yc compute instance stop <build-vm>
yc compute image create --name sw-browser-golden-v2 --source-disk-id <boot-disk-id>
# COMPUTE_BROWSER_IMAGE_ID=<image id>; the build VM can then be deleted.
```

## Control-plane config

```
COMPUTE_BROWSER_IMAGE_ID=<golden image id>
COMPUTE_BROWSER_ZONE=ru-central1-a
COMPUTE_BROWSER_SUBNET_ID=<subnet>
COMPUTE_BROWSER_SECURITY_GROUP_ID=<sg allowing 4444 from the control plane, egress to :3002>
COMPUTE_BROWSER_BASE_IMAGE=cr.yandex/<registry>/sw-linux-base:{version}   # {version} = platform.version
COMPUTE_BROWSER_INTERNAL_URL=http://<control-plane private ip>:3002
# COMPUTE_BROWSER_SCREEN_WIDTH=1360 / COMPUTE_BROWSER_SCREEN_HEIGHT=1020
```

A cloud account's `config` overrides `folderId`/`zone`/`subnetId`/`securityGroupId`/`imageId` per project
(delegated BYOC — the VM is created in the user's folder at their cost).

The kubernetes kind runs the same base image as a pod: `COMPUTE_K8S_BASE_IMAGE` (falls back to
`COMPUTE_BROWSER_BASE_IMAGE`), `COMPUTE_K8S_SCREEN_WIDTH/HEIGHT`.
