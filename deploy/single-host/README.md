# Minimum-cost single-host deploy

Runs the whole sw **control plane** on one small amd64 Compute VM: Postgres co-located with the four service
processes (`api`/`wd`/`internal`/`worker`, all one image) via `docker-compose.yml`. **Environments are not run
here** — the worker provisions them separately on demand (android → on-demand YC Compute VMs from the golden
image), so the only always-on cost is this one VM. This is the cheap alternative to the MK8s + managed-PG
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

    IMG=cr.yandex/<registry_id>/sw-service:oidc
    docker build --platform linux/amd64 -t "$IMG" .
    docker push "$IMG"        # yc credential helper authenticates cr.yandex

## Bring up the service (one VM)

1. Create a small amd64 VM (2 vCPU / 8 GB is comfortable; downsize for less), attach the `sw-k8s-nodes` SA,
   a public IP (api/wd), an SG allowing inbound 3000/3001 from the world and 3002 from the env subnet, and
   `docker` (install via the boot script / apt).
2. Copy `deploy/single-host/docker-compose.yml` to the VM and set env:

       export SW_IMAGE=cr.yandex/<registry_id>/sw-service:oidc
       export POSTGRES_PASSWORD=... INTERNAL_API_SECRET=...
       export COMPUTE_ANDROID_FOLDER_ID=<folder>
       export COMPUTE_ANDROID_INTERNAL_URL=http://<this-vm-private-ip>:3002
       # cheap first bring-up uses the local auth stub:
       export NODE_ENV=staging AUTH_STRATEGY=local
       docker compose pull && docker compose up -d

3. Smoke (local auth token is `Bearer <external-id>` — angle brackets literal):

       API=http://<vm-public-ip>:3000 ; AUTH='Authorization: Bearer <user1>'
       curl -s -X POST $API/v1/projects -H "$AUTH" -H 'content-type: application/json' \
         -d '{"displayName":"smoke","compute":[{"provider":"android-redroid","externalRef":"yc","platform":"android","execution":"container"}]}'

## OIDC (honest prod auth)

Switch `NODE_ENV=production AUTH_STRATEGY=oidc` and set `OIDC_ISSUER` / `OIDC_AUDIENCE` / `OIDC_JWKS_URI`
(+ `OIDC_GROUPS_CLAIM`) to an IdP the VM can reach (a Keycloak container on the same VM, or a managed IdP).
The local stub is refused under `NODE_ENV=production`. Realm setup mirrors `docs/deploy/local-oidc-keycloak`.

## Verifying VNC

Needs an android env, which needs a golden image rebaked from the **current** `images/android-node`
(per-env agent token + the scrcpy→Xvfb→x11vnc→websockify pipeline). Rebake (runbook §4), create an android
project + environment, wait for `ACTIVE`, create a session, then open the session's `sw:interactive` URL.

## Tear down

    docker compose down            # on the VM
    yc compute instance delete <vm>   # the only always-on cost
