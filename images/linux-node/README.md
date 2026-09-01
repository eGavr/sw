# linux-node (browser VM golden image)

The golden Compute image for the `yandex-cloud × linux/container` substrate: an on-demand **VM per
browser environment**. The VM boots, reads its parameters from instance metadata and runs the **stock
selenium node container with the heartbeat agent injected** — the exact same container + `agentBootstrap`
scheme the local docker adapter uses on the operator's machine, just on a dedicated VM in the (possibly
delegated) folder.

There is no Dockerfile here: the node is the stock selenium image. The golden is a plain Ubuntu with
docker, the selenium image **prebaked into the docker cache** (docker hub is not reachable from the RU
VMs, and prebaking removes the pull from the boot path), and the boot unit below.

## Contents

- `vm-boot.sh` — reads `sw-environment-id` / `sw-node-image` / `sw-session-timeout` / `sw-internal-url` /
  `sw-internal-token` from metadata, derives the endpoint from the VM's own private IP, and runs the node
  container with the agent bootstrap (fetches `/internal/agentScript:download` at startup — the agent is
  never baked).
- `sw-browser-boot.service` — oneshot systemd unit that runs it at boot.

## Baking the golden (one-time, in YC)

```bash
# 1. A build VM from stock Ubuntu 24.04 (any small preset), then on it:
sudo apt-get update && sudo apt-get install -y docker.io curl
# The selenium image, prebaked (amd64; pushed to our CR from a Mac via buildx --provenance=false):
sudo docker pull cr.yandex/<registry>/selenium-standalone-chrome:latest
sudo mkdir -p /opt/linux-node
sudo cp vm-boot.sh /opt/linux-node/ && sudo chmod +x /opt/linux-node/vm-boot.sh
sudo cp sw-browser-boot.service /etc/systemd/system/ && sudo systemctl enable sw-browser-boot

# 2. Stop the VM and cut the image:
yc compute instance stop <build-vm>
yc compute image create --name sw-browser-golden-v1 --source-disk-id <boot-disk-id>
# COMPUTE_BROWSER_IMAGE_ID=<image id>; the build VM can then be deleted.
```

## Control-plane config

```
COMPUTE_BROWSER_IMAGE_ID=<golden image id>
COMPUTE_BROWSER_ZONE=ru-central1-a
COMPUTE_BROWSER_SUBNET_ID=<subnet>
COMPUTE_BROWSER_SECURITY_GROUP_ID=<sg allowing 4444 from the control plane, egress to :3002>
COMPUTE_BROWSER_NODE_IMAGE=cr.yandex/<registry>/selenium-standalone-chrome:latest
COMPUTE_BROWSER_INTERNAL_URL=http://<control-plane private ip>:3002
```

A cloud account's `config` overrides `folderId`/`zone`/`subnetId`/`securityGroupId`/`imageId` per project
(delegated BYOC — the VM is created in the user's folder at their cost).
