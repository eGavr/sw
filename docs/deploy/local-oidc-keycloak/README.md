# Verify the OIDC auth strategy against a real IdP (locally, free)

Proves the `AUTH_STRATEGY=oidc` adapter end to end against **real identity-provider
software** (Keycloak) — real signed tokens, real JWKS, real `iss`/`aud`/`exp`, a
real `groups` claim — without any cloud or cost. This is the honest-prod-auth
milestone; the same Keycloak is the broker for the future UI login (federating
Google/GitHub — see PLAN п.35).

No code changes were needed: the adapter accepts Keycloak tokens as-is.

## Run it

```bash
# 1. Start Keycloak (off-the-shelf; ~30–60s to boot the first time)
docker compose -f docs/deploy/local-oidc-keycloak/docker-compose.yml up -d

# 2. Configure the realm (client + audience/groups mappers + users). Re-runnable.
bash docs/deploy/local-oidc-keycloak/setup-realm.sh

# 3. Mint a REAL token (password grant) for alice, who is in group `eng`
TOKEN=$(curl -s -X POST http://localhost:8085/realms/sw/protocol/openid-connect/token \
  -d grant_type=password -d client_id=sw-api -d username=alice -d password=alicepw \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

# 4. Run the api pointed at Keycloak (Postgres on 5433 as usual; NODE_ENV=development
#    so the `oidc` strategy is allowed — the prod fence only forbids `local`)
AUTH_STRATEGY=oidc \
OIDC_ISSUER=http://localhost:8085/realms/sw \
OIDC_AUDIENCE=sw \
OIDC_JWKS_URI=http://localhost:8085/realms/sw/protocol/openid-connect/certs \
pnpm --filter @sw/backend run start:api:dev

# 5. Use the real token (note the /v1 prefix on the running server)
curl -X POST localhost:3000/v1/projects -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"displayName":"kc-team","compute":[{"provider":"noop","platform":"linux","execution":"container"}]}'
```

## What it proves (verified 2026-08-24)

- Valid Keycloak token → `POST /v1/projects` **201**; the owner binding is
  `user:<keycloak-sub>` (`sub` → external id). `GET` it back → **200**.
- Groups: alice grants `roles/viewer` to `group:eng`; **bob** (also in `eng`,
  token carries `groups:["eng"]`) reads the project → **200**; **carol** (no
  group) → **403**. The `groups` claim from the real IdP drives IAM group access.
- Tampered / no token → **401**.

## Config mapping

| our env | Keycloak value |
|---|---|
| `OIDC_ISSUER` | `http://localhost:8085/realms/sw` |
| `OIDC_AUDIENCE` | `sw` (needs an **audience mapper** — Keycloak's default `aud` is `account`) |
| `OIDC_JWKS_URI` | `http://localhost:8085/realms/sw/protocol/openid-connect/certs` |
| `OIDC_GROUPS_CLAIM` | `groups` (default; needs a **group-membership mapper**, `full.path=false`) |

For a deployed prod, point these at the real issuer (a hosted Keycloak/Dex or a
public IdP) and inject them via the deployment config, exactly as here.

## Gotchas (baked into `setup-realm.sh`)

- **Audience**: without an audience mapper, Keycloak's `aud` is `account`, and
  jose's audience check fails (401). The mapper adds `sw` to `aud`.
- **Groups**: the group-membership mapper emits `/eng` by default; `full.path=false`
  gives the bare `eng` our `Member.group` expects.
- **"Account is not fully set up"**: a Keycloak 26 user needs `firstName`,
  `lastName`, `emailVerified=true` and a **non-temporary** password to log in.
- The running server mounts everything under **`/v1`** (the integration-test
  module does not) — use `/v1/projects`.
