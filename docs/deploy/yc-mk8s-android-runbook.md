# Deploy runbook — sw on YC MK8s with on-demand Android (redroid) Compute VMs

End-to-end proven 2026-08-14: `curl` the deployed control plane → create an Android environment (an
on-demand Compute VM from a prebaked golden image) → create a WebDriver session on the redroid device →
proxy commands. Everything runs in Yandex Cloud; the browser path (k8s Pods) and the Android path
(Compute VMs) share one control plane.

> **Region caveat.** This was built from inside YC (ru-central1), where **docker hub, github, nodesource,
> deb.debian.org and releases.hashicorp.com are frequently blocked/timing out.** Every workaround below
> exists because of that. Outside RU most of it simplifies.

---

## 0. Fixed identifiers (this environment)

| What | Value |
|---|---|
| cloud / folder / zone | `b1g23cusoicnl0rufjv0` / `b1g3vi0276vtbu9qvlme` / `ru-central1-a` |
| network / subnet (REUSED, not created — VPC net quota=1) | `enp4fadoaots3c2lb38o` / `e9bcp55uhm61e0jln645` (10.128.0.0/24) |
| MK8s cluster / node group | `sw` / `sw-nodes` (k8s **1.32** — 1.30 is deprecated) |
| Managed PG host | `c-c9qtqv3nq54q3vqpo2uc.rw.mdb.yandexcloud.net:6432` db/user `sw`/`sw` |
| Container Registry | `crpo6uus21aft1jdms01` → image `cr.yandex/crpo6uus21aft1jdms01/sw-service:v4` |
| node service account | `aje8tuel15umboqrcgg6` (`compute.editor` + `vpc.user` + `container-registry.images.puller`) |
| android env security group | `enpktcul739o27mqntlp` (`sw-android-env`) |
| **golden image (current)** | `sw-android-golden-v4` = **`fd8opcrg042a3lu6u90e`** (redroid 11/13/14 + companion+jq + vm-boot endpoint-fix) |
| external LBs | api `158.160.176.2:3000`, wd `158.160.189.234:3001` |
| internal callback | NodePort `31875` on the sw-internal node `10.128.0.5` (svc `externalTrafficPolicy: Local`) |
| ssh key baked into golden image (debug) | `/tmp/sw-redroid-key` (user `ubuntu`) |
| tooling | OpenTofu `/tmp/tfbin/tofu`; provider mirror in `~/.terraformrc` (terraform-mirror.yandexcloud.net) |

Deploy overlay with real values lives in `/tmp/sw-deploy/` (ephemeral — the reproducible parts are `terraform/`,
`k8s/`, `packages/android-node/` in the repo; the `config.yaml` values are listed in §3).

---

## 1. Bring it UP

### 1a. Infra (OpenTofu — terraform is blocked from RU, OpenTofu comes from github via your Mac)

    curl -fsSL -o /tmp/tofu.zip https://github.com/opentofu/opentofu/releases/download/v1.8.8/tofu_1.8.8_darwin_arm64.zip
    unzip -o /tmp/tofu.zip -d /tmp/tfbin
    cat > ~/.terraformrc <<'RC'
    provider_installation { network_mirror { url = "https://terraform-mirror.yandexcloud.net/" }
      direct { exclude = ["registry.terraform.io/*/*"] } }
    RC
    # terraform/terraform.tfvars (reuse the existing network — VPC net quota is 1):
    #   cloud_id/folder_id/zone, network_id=enp4fadoaots3c2lb38o, subnet_id=e9bcp55uhm61e0jln645,
    #   subnet_cidr="10.128.0.0/24", pg_password=..., k8s_version="1.32"
    TF_CLI_CONFIG_FILE=$HOME/.terraformrc YC_TOKEN=$(yc iam create-token) \
      /tmp/tfbin/tofu -chdir=terraform init
    TF_CLI_CONFIG_FILE=$HOME/.terraformrc YC_TOKEN=$(yc iam create-token) \
      /tmp/tfbin/tofu -chdir=terraform apply -auto-approve
    # outputs: registry_id, postgres_host_rw, subnet_id, android_env_security_group_id, folder_id

### 1b. Build & push the sw image (amd64) — build on an amd64 VM, NOT via qemu (qemu segfaults `npm ci`)

    # a small amd64 Ubuntu VM (or the golden-image build VM), then:
    docker login cr.yandex -u iam -p $(yc iam create-token)
    for i in $(seq 1 10); do docker pull node:22-slim && break; sleep 8; done      # docker hub is flaky
    docker pull selenium/ffmpeg:latest
    docker build -t cr.yandex/<registry_id>/sw-service:v4 . && docker push cr.yandex/<registry_id>/sw-service:v4

### 1c. Golden image for Android env VMs (see `packages/android-node/`, §4 for how it's baked)

Use the existing one (`fd8opcrg042a3lu6u90e`) or rebake per §4.

### 1d. Deploy the control plane

    yc managed-kubernetes cluster get-credentials sw --external --force
    kubectl apply -f k8s/namespace.yaml -f k8s/rbac.yaml
    kubectl create configmap sw-postgres-ca -n sw --from-file=root.crt=<CA.pem>   # storage.yandexcloud.net/cloud-certs/CA.pem
    # secrets: INTERNAL_API_SECRET=$(openssl rand -hex 32), POSTGRES_PASSWORD=...
    kubectl apply -f /tmp/sw-deploy/secrets.yaml
    # config: the ConfigMap in §3 (real PG host + COMPUTE_ANDROID_* + callback URL)
    kubectl apply -f /tmp/sw-deploy/config.yaml
    kubectl apply -f /tmp/sw-deploy/migrate-job.yaml           # image retagged to cr.yandex/.../sw-service:v4
    kubectl apply -f /tmp/sw-deploy/control-plane.yaml         # 4 Deployments, image retagged
    # expose api + wd (NLB count quota is 2 — that's exactly api + wd; the internal callback uses NodePort, §2)
    kubectl apply -f /tmp/sw-deploy/external-lb.yaml
    # internal callback = sw-internal as NodePort, pinned to the pod's node:
    kubectl patch svc sw-internal -n sw -p '{"spec":{"type":"NodePort","externalTrafficPolicy":"Local"}}'
    #   COMPUTE_ANDROID_INTERNAL_URL = http://<node-ip-of-sw-internal-pod>:<nodePort>

### 1e. Smoke test (the whole point)

    API=http://<api-lb>:3000 ; WD=http://<wd-lb>:3001 ; AUTH='Authorization: Bearer <user1>'   # angle brackets are literal
    ACC=$(curl -s -X POST $API/v1/accounts -H "$AUTH" -H 'content-type: application/json' \
      -d '{"displayName":"android","compute":{"provider":"android-redroid","externalRef":"yc"}}' | jq -r .uid)
    ENV=$(curl -s -X POST $API/v1/accounts/$ACC/environments -H "$AUTH" -H 'content-type: application/json' \
      -d '{"platform":{"name":"android","version":"13"},"execution":"container","applications":[{"name":"settings","version":"13"}]}' | jq -r .uid)
    # poll GET .../environments/$ENV until state=ACTIVE (~3-4 min: VM boot + Android boot + Appium)
    SID=$(curl -s -X POST $WD/sessions -H "$AUTH" -H 'content-type: application/json' \
      -d "{\"capabilities\":{\"alwaysMatch\":{\"browserName\":\"settings\",\"browserVersion\":\"13\",\"sw:accountId\":\"$ACC\",\"sw:execution\":\"container\"}}}" | jq -r .value.sessionId)
    curl -s $WD/sessions/$SID/appium/device/current_package -H "$AUTH"     # -> com.android.launcher3

---

## 2. Gotchas (every one cost real time)

- **Local auth token is `Bearer <external-id>` — the angle brackets are literal** (`User.from` matches `/<…>/`).
- **create-account body** is `{displayName, compute:{provider, externalRef}}` (not `resources`).
- **Application name** must match `^[a-z0-9][a-z0-9-]*$` — no dots (use `settings`, not `com.android.settings`).
- **k8s 1.30 is deprecated** → use 1.32 (STABLE is 1.32/1.33/1.34).
- **VPC network quota = 1** → reuse the existing network via `data` sources (don't create a new VPC).
- **Network Load Balancer quota = 2** → that's exactly api-lb + wd-lb; the agent→control-plane callback must
  NOT be a third (internal) NLB → expose sw-internal as a **NodePort** and point `COMPUTE_ANDROID_INTERNAL_URL`
  at the node running the sw-internal pod, with `externalTrafficPolicy: Local`.
- **network-ssd disk quota is tight** (2 nodes×64GB + each env VM 40GB). Keep few VMs; delete build VMs; the
  golden image's min disk is 40GB so `COMPUTE_ANDROID_DISK_GB≥40`.
- **Android env VMs must be internal-only (no NAT/public IP).** A public IP needs `vpc.publicAdmin` (the node SA
  only has `vpc.user`) AND a scarce external address → the adapter creates them without NAT.
- **In-cluster worker → YC auth:** the worker takes the node SA's IAM token from the instance metadata service
  (`169.254.169.254`) and passes it as `YC_TOKEN`; the node SA needs `compute.editor` + `vpc.user`.
- **`yc`/`kubectl` are bundled in the sw image** (from YC object storage / dl.k8s.io).
- **The companion image needs `jq`** — the heartbeat agent parses the node `/status` with it; without it the
  agent never registers.
- **vm-boot derives the env endpoint from the VM's own private IP** (a missing `sw-endpoint` metadata attribute
  comes back as the literal `"Not Found"`).
- **Android boots slowly** (~3-4 min): keep `WORKER_PREPARING_TIMEOUT_MS` generous (≥360000) and
  `HEARTBEAT_FRESHNESS_MS` tolerant (~120000).
- **RU network:** build the sw image natively on amd64 (qemu segfaults `npm ci`); `npm` → `registry.npmmirror.com`;
  apt in images → `mirror.yandex.ru`; terraform provider → YC mirror; get OpenTofu/repo tarballs from your Mac via scp
  (github is unreachable on the VMs).

---

## 3. The `sw-config` ConfigMap (Android-relevant keys)

    POSTGRES_HOST: c-c9qtqv3nq54q3vqpo2uc.rw.mdb.yandexcloud.net   # + PORT 6432, USER/DATABASE sw, SSL true, CA /etc/ssl/yandex/root.crt
    COMPUTE_ANDROID_IMAGE_ID: fd8opcrg042a3lu6u90e
    COMPUTE_ANDROID_ZONE: ru-central1-a
    COMPUTE_ANDROID_SUBNET_ID: e9bcp55uhm61e0jln645
    COMPUTE_ANDROID_SECURITY_GROUP_ID: enpktcul739o27mqntlp
    COMPUTE_ANDROID_FOLDER_ID: b1g3vi0276vtbu9qvlme
    COMPUTE_ANDROID_DEFAULT_VERSION: "13"
    COMPUTE_ANDROID_DISK_GB: "40"
    COMPUTE_ANDROID_MEMORY_GB: "16"
    COMPUTE_ANDROID_INTERNAL_URL: http://10.128.0.5:31875        # sw-internal NodePort on its pod's node
    WORKER_PREPARING_TIMEOUT_MS: "360000"
    HEARTBEAT_FRESHNESS_MS: "120000"

---

## 4. Rebake the golden image (when packages/android-node changes)

    # create a VM FROM the current golden image (it already has docker + redroid tags + companion + node base):
    yc compute instance create --name sw-imgbuild --zone ru-central1-a \
      --network-interface subnet-id=e9bcp55uhm61e0jln645,nat-ip-version=ipv4 \
      --create-boot-disk image-id=<current-golden>,size=40,type=network-ssd \
      --memory 4 --cores 2 --metadata-from-file ssh-keys=<ubuntu:pubkey>
    # on it: disable sw-android-boot, rebuild the companion (docker build packages/android-node → sw/android-node:latest,
    #   or a quick `FROM sw/android-node:latest; RUN apt install jq` overlay), and/or update /opt/android-node/vm-boot.sh,
    #   re-enable sw-android-boot, remove containers.
    yc compute instance stop --name sw-imgbuild
    yc compute image create --name sw-android-golden-vN --source-disk-id <its-boot-disk>
    # KERNEL DRIFT: install linux-modules-extra for the GRUB-DEFAULT kernel (the latest installed), not `uname -r`,
    #   or redroid crash-loops on the fresh VM (binder_linux not found). /etc/modules-load.d/binder.conf autoloads it.

---

## 5. Tear it DOWN

    # env VMs are the worker's; delete any leftovers first:
    for v in $(yc compute instance list | awk -F'|' '/sw-env/{print $3}'); do yc compute instance delete --name "$(echo $v)" --async; done
    # LB Services FIRST (so the cloud controller reaps the NLBs — avoids orphaned load balancers):
    kubectl delete svc sw-api-lb sw-wd-lb -n sw
    # then the whole stack:
    TF_CLI_CONFIG_FILE=$HOME/.terraformrc YC_TOKEN=$(yc iam create-token) /tmp/tfbin/tofu -chdir=terraform destroy -auto-approve
    # tofu destroy removes the cluster/PG/CR/SG/SA/IAM. It does NOT touch: the reused network (data source),
    # the golden image, or leftover env/build VMs — delete those by hand:
    #   yc compute image delete --name sw-android-golden-v4     (only if you don't want to keep it)

**Cost note:** stopping the MK8s cluster isn't a thing (managed); `tofu destroy` is the off switch. The golden
image + reused network cost ~nothing to keep for a fast re-`apply`.
