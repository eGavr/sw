# Minimum-cost single-host deploy

Runs the whole sw stack on one small amd64 Compute VM: Postgres co-located with the four service
processes (`api`/`wd`/`internal`/`worker`, one backend image) **plus the dashboard** (`frontend`, its own
image) via `docker-compose.yml`, and Keycloak via `keycloak-compose.yml`. **Environments are not run
here** — the worker provisions them separately on demand (android and linux browsers → on-demand YC
Compute VMs from the golden images), so the only always-on cost is this one VM.

Ports mirror local dev: **frontend 3000** (user-facing UI), **api 4000**, **wd 3001**, internal 3002
(env subnet only), Keycloak 8085. Open 3000/3001/4000/8085 to the world, 3002 to the env subnet. This is the cheap alternative to the MK8s + managed-PG
topology in `../../docs/deploy/yc-mk8s-android-runbook.md` (which stays the prod-shaped option).

## Prereqs (reused, already exist in YC)

- Network/subnet `default` / `e9bcp55uhm61e0jln645` (ru-central1-a, 10.128.0.0/24).
- Service account `sw-k8s-nodes` (`compute.editor` + `vpc.user` + `container-registry.images.puller`) —
  attach it to the VM so the worker can create env VMs and pull the image.
- Container Registry with the `sw-service` image (build below).
- Golden image for android env VMs (`../../images/android-node`, runbook §4). **Rebake it whenever
  `images/android-node` changes** — the one baked before per-env agent tokens + the VNC pipeline won't
  register against the current internal API (see "Verifying VNC" caveat).

## Build & push the image

Build for amd64 (the VMs are x86_64). On a machine with unrestricted internet (e.g. your Mac) this is one
step — the qemu build works; only building *inside* RU needs the runbook's npm/apt mirror workarounds:

    IMG=cr.yandex/<registry_id>/sw-service:latest
    docker buildx build --platform linux/amd64 --provenance=false --sbom=false -t "$IMG" --push .

    # The dashboard image. NEXT_PUBLIC_WD_URL is inlined into the client bundle at BUILD time —
    # rebuild if the public address changes.
    FE=cr.yandex/<registry_id>/sw-frontend:latest
    docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
      -f apps/frontend/Dockerfile --build-arg NEXT_PUBLIC_WD_URL=http://<vm-public-ip>:3001 \
      -t "$FE" --push .

(`--provenance=false` is required — YC CR rejects OCI attestation manifests.)

Docker hub is not reachable from the RU VMs, so `postgres:16` must also come from our CR: copy the amd64
manifest once from a machine that can reach both (`docker buildx imagetools create --tag
cr.yandex/<registry_id>/postgres:16 docker.io/library/postgres:16@<amd64 digest>`), then on the VM pull it
and `docker tag` it back to `postgres:16`. After `setup-realm.sh`, set `sslRequired=NONE` on realms `sw`
and `master` (kcadm `update realms/<r> -s sslRequired=NONE`) — Keycloak refuses http token requests from
external addresses otherwise.

## Bring up the service (one VM)

1. Create a small amd64 VM (2 vCPU / 8 GB is comfortable; downsize for less), attach the `sw-k8s-nodes` SA,
   a public IP (api/wd), an SG allowing inbound 3000/3001 from the world and 3002 from the env subnet, and
   `docker` (install via the boot script / apt).
2. Copy `deploy/single-host/docker-compose.yml` to the VM and set env:

       export SW_IMAGE=cr.yandex/<registry_id>/sw-service:latest
       export SW_FRONTEND_IMAGE=cr.yandex/<registry_id>/sw-frontend:latest
       export POSTGRES_PASSWORD=... INTERNAL_API_SECRET=...
       export CLOUD_CATALOG=yandex-cloud
       export COMPUTE_ANDROID_FOLDER_ID=<service folder>
       export COMPUTE_ANDROID_INTERNAL_URL=http://<this-vm-private-ip>:3002
       # Browser env VMs (linux/container) from the linux-node golden (../../images/linux-node):
       export COMPUTE_BROWSER_IMAGE_ID=<sw-browser-golden image id>
       export COMPUTE_BROWSER_SUBNET_ID=<subnet> COMPUTE_BROWSER_SECURITY_GROUP_ID=<sg>
       export COMPUTE_BROWSER_NODE_IMAGE=cr.yandex/<registry_id>/selenium-standalone-chrome:latest
       export COMPUTE_BROWSER_INTERNAL_URL=http://<this-vm-private-ip>:3002
       # Frontend (Auth.js against the co-located Keycloak):
       export AUTH_URL=http://<vm-public-ip>:3000 AUTH_SECRET=$(openssl rand -base64 32)
       export AUTH_KEYCLOAK_SECRET=<sw-web client secret> AUTH_KEYCLOAK_ISSUER=http://<vm-public-ip>:8085/realms/sw
       # cheap first bring-up uses the local auth stub:
       export NODE_ENV=staging AUTH_STRATEGY=local
       docker compose pull && docker compose up -d

   The delegated-BYOC demo keeps the "user's" resources fully separate: a second folder (grant the
   service SA `compute.editor` + `vpc.user` on it; connect the cloud with `config.folderId=<that folder>`)
   and the user's own bucket (grant the `sw-object-storage` SA access; register it as the project's
   storageDestination). Env VMs are then created — and billed — in the user's folder.

3. Smoke (local auth token is `Bearer <external-id>` — angle brackets literal):

       API=http://<vm-public-ip>:4000 ; AUTH='Authorization: Bearer <user1>'
       curl -s -X POST $API/v1/projects -H "$AUTH" -H 'content-type: application/json' \
         -d '{"displayName":"smoke","compute":[{"provider":"android-redroid","externalRef":"yc","platform":"android","execution":"container"}]}'

## OIDC (honest prod auth)

Switch `NODE_ENV=production AUTH_STRATEGY=oidc` and set `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_JWKS_URI`
(+ `OIDC_GROUPS_CLAIM`) to an IdP the VM can reach (a Keycloak container on the same VM, or a managed IdP).
The local stub is refused under `NODE_ENV=production`. Realm setup mirrors `docs/deploy/local-oidc-keycloak`
(run `setup-realm.sh` + `setup-web-client.sh` against the deployed Keycloak — the latter creates the
confidential `sw-web` client the frontend's Auth.js uses; its secret goes to `AUTH_KEYCLOAK_SECRET`).

## Verifying VNC

Needs an android env, which needs a golden image rebaked from the **current** `images/android-node`
(per-env agent token + the scrcpy→Xvfb→x11vnc→websockify pipeline). Rebake (runbook §4), create an android
project + environment, wait for `ACTIVE`, create a session, then open the session's `sw:interactive` URL.

## Tear down

    docker compose down            # on the VM
    yc compute instance delete <vm>   # the only always-on cost
