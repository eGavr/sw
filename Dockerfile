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

FROM ${NODE_IMAGE} AS builder
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
# The frozen lockfile covers every workspace importer, so each package.json must be present even though
# only the backend is built here.
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --frozen-lockfile
COPY apps/backend ./apps/backend
# tsc emits only .js; copy the static assets the controllers serve at runtime (agent bootstrap script,
# interactive noVNC viewer page).
RUN pnpm --filter @sw/backend run build \
    && cp apps/backend/src/presentation/http/internal/controllers/agent/heartbeat-agent.sh \
          apps/backend/build/src/presentation/http/internal/controllers/agent/heartbeat-agent.sh \
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
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /repo/apps/backend/build ./apps/backend/build
# The internal controller serves this to environments (GET /internal/ffmpeg:download?arch=amd64) from
# INTERNAL_FFMPEG_DIR (default bin/ffmpeg). World-readable static binary, so USER node can stream it.
COPY --from=ffmpeg /usr/local/bin/ffmpeg ./apps/backend/bin/ffmpeg/ffmpeg-amd64
COPY apps/backend/env ./apps/backend/env
WORKDIR /repo/apps/backend
USER node
# Default to the api; compose/k8s override `command` for wd / internal / worker.
CMD ["node", "build/src/presentation/http/api/index.js"]
