# One image for all four service processes (api / wd / internal / worker); each Deployment picks its
# entrypoint via `command`. kubectl is bundled for the worker's Kubernetes compute adapter and yc for its
# Android (YC Compute VM) adapter; the other processes never invoke them.
#
# pnpm monorepo: the backend package lives at apps/backend. The image installs the workspace, builds the
# backend, and runs with the working dir set to /repo/apps/backend so the process's relative paths
# (build/src/…, env/.env.<NODE_ENV>, bin/ffmpeg) resolve exactly as the compose/k8s `command`s expect.
ARG NODE_IMAGE=node:22-slim
ARG KUBECTL_VERSION=v1.31.1

# Static ffmpeg the internal controller serves to environments for session video recording (a minimal
# static build with x11grab + libx264). Matches the image's target arch, so building --platform linux/amd64
# yields the amd64 ffmpeg the amd64 nodes need.
FROM selenium/ffmpeg:latest AS ffmpeg

# NetBridge forwarder: a tiny static Go binary the internal controller serves to environments (a loopback
# SOCKS5 proxy that tunnels out to the rendezvous). Cross-compiled for both arches so the control plane can
# serve whichever the env node runs, regardless of this image's platform.
FROM golang:1.23 AS forwarder
WORKDIR /src
COPY packages/netbridge/forwarder/ ./
RUN GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/netbridge-amd64 . \
    && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/netbridge-arm64 .

FROM ${NODE_IMAGE} AS builder
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# The frozen lockfile covers every workspace importer, so each package.json must be present even though
# only the backend is built here.
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/netbridge/package.json ./packages/netbridge/
# The CLI runs on the user's machine, not the control plane — its package.json is present only so the
# frozen lockfile resolves every workspace importer; its source is never built or shipped here.
COPY packages/netbridge-cli/package.json ./packages/netbridge-cli/
RUN pnpm install --frozen-lockfile
COPY apps/backend ./apps/backend
COPY packages/netbridge ./packages/netbridge
# tsc emits only .js; copy the static assets the controllers serve at runtime (agent bootstrap script,
# interactive noVNC viewer page). The backend imports @sw/netbridge, so build that workspace package first.
RUN pnpm --filter @sw/netbridge run build \
    && pnpm --filter @sw/backend run build \
    && cp apps/backend/src/presentation/http/internal/controllers/agent/heartbeat-agent.sh \
          apps/backend/build/src/presentation/http/internal/controllers/agent/heartbeat-agent.sh \
    && cp apps/backend/src/presentation/http/internal/controllers/pool-hosts/pool-host-agent.sh \
          apps/backend/build/src/presentation/http/internal/controllers/pool-hosts/pool-host-agent.sh \
    && cp apps/backend/src/presentation/http/wd/controllers/interactive/interactive.html \
          apps/backend/build/src/presentation/http/wd/controllers/interactive/interactive.html

FROM ${NODE_IMAGE} AS runtime
ARG KUBECTL_VERSION
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
# ca-certificates for outbound TLS (Postgres SSL, registry); kubectl for the k8s compute adapter; the yc
# CLI for the Android (YC Compute VM) adapter; the docker CLI for the docker compute adapter (talks to a
# mounted host docker socket — lets the worker run browser env containers on a plain VM). All static, no rc.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL -o /usr/local/bin/kubectl \
       "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/$(dpkg --print-architecture)/kubectl" \
    && chmod +x /usr/local/bin/kubectl \
    && curl -fsSL https://download.docker.com/linux/static/stable/x86_64/docker-27.3.1.tgz \
       | tar -xzO docker/docker > /usr/local/bin/docker && chmod +x /usr/local/bin/docker \
    && curl -sSL https://storage.yandexcloud.net/yandexcloud-yc/install.sh | bash -s -- -i /opt/yc -n \
    && ln -s /opt/yc/bin/yc /usr/local/bin/yc \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/netbridge/package.json ./packages/netbridge/
COPY packages/netbridge-cli/package.json ./packages/netbridge-cli/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /repo/apps/backend/build ./apps/backend/build
# The backend resolves @sw/netbridge through the workspace symlink; ship its built output.
COPY --from=builder /repo/packages/netbridge/dist ./packages/netbridge/dist
# The internal controller serves this to environments (GET /internal/ffmpeg:download?arch=amd64) from
# INTERNAL_FFMPEG_DIR (default bin/ffmpeg). World-readable static binary, so USER node can stream it.
COPY --from=ffmpeg /usr/local/bin/ffmpeg ./apps/backend/bin/ffmpeg/ffmpeg-amd64
# The forwarder binaries served from INTERNAL_NETBRIDGE_DIR (default bin/netbridge), one per arch.
COPY --from=forwarder /out/netbridge-amd64 ./apps/backend/bin/netbridge/netbridge-amd64
COPY --from=forwarder /out/netbridge-arm64 ./apps/backend/bin/netbridge/netbridge-arm64
COPY apps/backend/env ./apps/backend/env
WORKDIR /repo/apps/backend
USER node
# Default to the api; compose/k8s override `command` for wd / internal / worker.
CMD ["node", "build/src/presentation/http/api/index.js"]
