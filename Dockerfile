# One image for all four service processes (api / wd / internal / worker); each Deployment picks its
# entrypoint via `command`. kubectl is bundled for the worker's Kubernetes compute adapter; the other
# processes never invoke it.
ARG NODE_IMAGE=node:22-slim
ARG KUBECTL_VERSION=v1.31.1

# Static ffmpeg the internal controller serves to environments for session video recording (a minimal
# static build with x11grab + libx264). Matches the image's target arch, so building --platform linux/amd64
# yields the amd64 ffmpeg the amd64 nodes need.
FROM selenium/ffmpeg:latest AS ffmpeg

FROM ${NODE_IMAGE} AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# tsc emits only .js; copy the agent bootstrap script the internal controller serves at runtime.
RUN cp src/presentation/http/internal/controllers/agent/heartbeat-agent.sh \
       build/src/presentation/http/internal/controllers/agent/heartbeat-agent.sh

FROM ${NODE_IMAGE} AS runtime
ARG KUBECTL_VERSION
WORKDIR /app
ENV NODE_ENV=production
# ca-certificates for outbound TLS (Postgres SSL, registry); kubectl for the k8s compute adapter.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -fsSL -o /usr/local/bin/kubectl \
       "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/$(dpkg --print-architecture)/kubectl" \
    && chmod +x /usr/local/bin/kubectl \
    && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/build ./build
# The internal controller serves this to environments (GET /internal/ffmpeg:download?arch=amd64) from
# INTERNAL_FFMPEG_DIR (default bin/ffmpeg). World-readable static binary, so USER node can stream it.
COPY --from=ffmpeg /usr/local/bin/ffmpeg ./bin/ffmpeg/ffmpeg-amd64
COPY env ./env
USER node
# Default to the api; k8s Deployments override command for wd / internal / worker.
CMD ["node", "build/src/presentation/http/api/index.js"]
