# @sw/frontend

The sw dashboard — Next.js (App Router) + Mantine, authenticated via Auth.js (Keycloak, BFF pattern).
Tokens never reach the browser: the Next server holds them and proxies to the sw `api`/`wd` under
`/api/sw/*`. See `PLAN.md` → "UI / дашборд (frontend)".

## Run locally

From the repo root:

    pnpm install
    pnpm --filter @sw/frontend dev     # http://localhost:3000

Build:

    pnpm --filter @sw/frontend build

## Status (incremental)

- **step 1 (this):** Next + Mantine scaffold — AppShell + Projects placeholder (mock data), no auth.
- step 2: Auth.js (Keycloak) + `/api/sw/*` BFF proxy → real Projects.
- step 3: Project → Environments (list / create / delete).
- step 4: New session (capabilities + `sw:logging` / `sw:video` toggles; session id shown once).
- step 5: Inspect session (VNC / Logs / Video, stateless by pasted id).
