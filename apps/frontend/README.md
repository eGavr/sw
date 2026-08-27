# @sw/frontend

The sw dashboard — Next.js (App Router) + Mantine, authenticated via Auth.js (Keycloak, BFF pattern).
Tokens never reach the browser: the Next server holds them and proxies to the sw `api`/`wd` under
`/api/sw/*`. See `PLAN.md` → "UI / дашборд (frontend)".

## Run locally

Login only (step 2a) needs just the frontend + local Keycloak. Real data (step 2b+) also needs the sw
api running on **:4000** (the frontend owns :3000). From the repo root:

    pnpm install

    # 1) sw api on :4000, verifying tokens from the local Keycloak (Postgres on 5433 must be up)
    cd apps/backend && NODE_ENV=development AUTH_STRATEGY=oidc API_PORT=4000 \
      OIDC_ISSUER=http://localhost:8085/realms/sw OIDC_AUDIENCE=sw \
      OIDC_JWKS_URI=http://localhost:8085/realms/sw/protocol/openid-connect/certs \
      pnpm exec ts-node src/presentation/http/api/index.ts

    # 2) the dashboard on :3000 (needs apps/frontend/.env.local — see .env.local.example)
    pnpm --filter @sw/frontend dev     # http://localhost:3000  → sign in as alice / alicepw

Build:

    pnpm --filter @sw/frontend build

## Status (incremental)

- **step 1 (this):** Next + Mantine scaffold — AppShell + Projects placeholder (mock data), no auth.
- step 2: Auth.js (Keycloak) + `/api/sw/*` BFF proxy → real Projects.
- step 3: Project → Environments (list / create / delete).
- step 4: New session (capabilities + `sw:logging` / `sw:video` toggles; session id shown once).
- step 5: Inspect session (VNC / Logs / Video, stateless by pasted id).
