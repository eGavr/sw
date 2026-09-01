# The sw dashboard (Next.js App Router + Auth.js BFF). Built as a standalone server bundle: the runtime
# stage carries only .next/standalone + static assets, no pnpm store.
#
# NEXT_PUBLIC_* values are inlined into the client bundle AT BUILD TIME, so the wd base URL the browser
# talks to (interactive viewer links) rides as a build arg — rebuild the image if the public address
# changes. Server-side URLs (SW_API_URL, AUTH_*) stay runtime env.
ARG NODE_IMAGE=node:22-slim

FROM ${NODE_IMAGE} AS builder
ARG NEXT_PUBLIC_WD_URL
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile
COPY apps/frontend ./apps/frontend
# A dummy AUTH_SECRET keeps next build's page evaluation happy; the real one is runtime env.
RUN cd apps/frontend \
    && NEXT_PUBLIC_WD_URL=${NEXT_PUBLIC_WD_URL} AUTH_SECRET=build-time-placeholder pnpm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Standalone bundle keeps the monorepo layout: the server entry lives under apps/frontend/server.js.
COPY --from=builder /repo/apps/frontend/.next/standalone ./
COPY --from=builder /repo/apps/frontend/.next/static ./apps/frontend/.next/static
USER node
ENV PORT=3000
CMD ["node", "apps/frontend/server.js"]
