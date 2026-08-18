# YC dev stack — torn down to storage-only, how to restore

**State (2026-08-18):** the billable YC stack was torn down to **storage-only (~₽125/mo)** to stop paying
during development. **Deleted:** the MK8s cluster (master + node group) and the **Managed PostgreSQL**
cluster. **Kept (storage/free):** the container registry (with the sw image), the Android golden image,
the reused VPC network, the security groups, and the service accounts.

We do NOT need Managed PostgreSQL for dev — restore uses **in-cluster Postgres** (the PoC manifests), so
data is ephemeral and there is no Managed-PG bill. This is the same shape the earliest PoC ran.

---

## 0. Kept resources (the durable value — reuse on restore)

| What | ID / value |
|---|---|
| cloud / folder / zone | `b1g23cusoicnl0rufjv0` / `b1g3vi0276vtbu9qvlme` / `ru-central1-a` |
| VPC network / subnet (reused) | `enp4fadoaots3c2lb38o` (default) / `e9bcp55uhm61e0jln645` (10.128.0.0/24) |
| **container registry** (has `sw-service` image) | **`crpo6uus21aft1jdms01`** → `cr.yandex/crpo6uus21aft1jdms01/sw-service:v4` |
| **Android golden image** (v4, redroid 11/13/14 + companion) | **`fd8opcrg042a3lu6u90e`** (`sw-android-golden-v4`) |
| security groups | `enpunncrqjf98a87mvns` (sw-k8s) · `enpktcul739o27mqntlp` (sw-android-env) · `enpd4dt8tt7p2d7i0o8p` (sw-pg) |
| node service account (Android VMs need it: `compute.editor`+`vpc.user`) | `aje8tuel15umboqrcgg6` (sw-k8s-nodes) |
| cluster service account | `ajeb0vg68dloplav1n12` (sw-k8s-cluster) |
| object-storage SA (logs/video S3, if used) | `aje7a4nu70e3qc1r3du6` (sw-object-storage) |
| tooling | OpenTofu `/tmp/tfbin/tofu`; `~/.terraformrc` = YC mirror; ssh key `/tmp/sw-redroid-key` |

Deleted (recreate on restore): MK8s cluster (was `catonokbfo40a0ao9jhd`), node group, Managed PG (was
`c9qtqv3nq54q3vqpo2uc`), the two external NLBs (were `158.160.176.2:3000` / `158.160.189.234:3001` — new
IPs on restore).

---

## 1. Restore for DEV (in-cluster Postgres, no Managed PG) — ~15–20 min

⚠️ **Image caveat first.** `cr.yandex/crpo6uus21aft1jdms01/sw-service:v4` was built from the **D3/Android**
code, BEFORE the `Account`→`Project` rename and the provider-config work (branches
`refactor.rename-local-provider-to-noop` / `feat.provider-config`). Restoring with `:v4` gives the **old
API** (`/v1/accounts`, `sw:accountId`). To run the **current** code, rebuild+push the image first (on an
**amd64 VM** — qemu segfaults `npm ci` on the Mac): `docker build -t cr.yandex/crpo6uus21aft1jdms01/sw-service:<tag> .`
and use `<tag>` below. For a quick bring-up of the old code, `:v4` works as-is.

1. **Recreate cluster + node group** (reuse the kept network/SG/SA). Either `tofu -chdir=terraform apply`
   **targeting only the cluster + node group** (so it does NOT recreate Managed PG — we use in-cluster PG),
   or recreate via `yc managed-kubernetes cluster/node-group create` reusing network `enp4fadoaots3c2lb38o`,
   subnet `e9bcp55uhm61e0jln645`, SG `enpunncrqjf98a87mvns`, cluster-SA `ajeb0vg68dloplav1n12`, node-SA
   `aje8tuel15umboqrcgg6`, k8s **1.32**, node = standard-v3 4vCPU/8GB/64GB-ssd, fixed size 2. (~10–15 min.)
2. `yc managed-kubernetes cluster get-credentials sw --external --force`.
3. **Deploy with in-cluster Postgres (PoC):**
   ```
   kubectl apply -f k8s/namespace.yaml -f k8s/rbac.yaml -f k8s/config-poc.yaml -f k8s/postgres-poc.yaml
   IMG=cr.yandex/crpo6uus21aft1jdms01/sw-service:<tag>
   kubectl create secret generic sw-secrets -n sw --from-literal=INTERNAL_API_SECRET=$(openssl rand -hex 32) \
     --from-literal=POSTGRES_PASSWORD=postgres --dry-run=client -o yaml | kubectl apply -f -
   sed "s#sw/service:latest#$IMG#g" k8s/migrate-job.yaml    | kubectl apply -f -
   kubectl wait --for=condition=complete job/sw-migrate -n sw --timeout=240s
   sed "s#sw/service:latest#$IMG#g" k8s/control-plane.yaml  | kubectl apply -f -
   kubectl apply -f k8s/yc/lb.yaml     # external NLBs -> new IPs
   ```
   `config-poc.yaml` already points `POSTGRES_HOST=sw-postgres` (in-cluster), SSL off; `postgres-poc.yaml`
   is a `postgres:16-alpine` Deployment + 1Gi PVC. Data is fresh (migrations run) — fine for dev.
4. Android env VMs: to provision them, also set the `COMPUTE_ANDROID_*` config on `sw-config` (image
   `fd8opcrg042a3lu6u90e`, subnet `e9bcp55uhm61e0jln645`, SG `enpktcul739o27mqntlp`, folder
   `b1g3vi0276vtbu9qvlme`) and wire the `sw-internal` NodePort callback — see `k8s/yc/deploy.sh` /
   `docs/deploy/yc-mk8s-android-runbook.md`. Not needed for browser-only bring-up.

**Full (Managed-PG) restore** instead: `tofu -chdir=terraform apply` (recreates cluster + Managed PG) +
`POSTGRES_PASSWORD=... GOLDEN_IMAGE_ID=fd8opcrg042a3lu6u90e bash k8s/yc/deploy.sh` — the original runbook
path. Only if you want persistent Managed PG (billed while running); for dev prefer the in-cluster PoC above.

---

## 2. Cost while torn down

~₽125/mo, storage only: golden image ~32 GB (~₽120) + `sw-service` registry image (~₽5). No master, no
nodes, no Managed PG, no NLB. (Full teardown incl. registry + golden image = ~₽0, but then restore needs an
image rebuild + a golden-image rebake ~hours — not worth it; keep them.)
