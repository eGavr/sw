# The linux base image: one Ubuntu release, a headless display stack and the runtime libraries of the
# Chromium and Firefox families —
# and nothing sw-specific baked in. Everything else arrives at start from the control plane: the node
# script and the wd door (this image's bootstrap fetches them), the heartbeat agent (the compute
# gateway's bootstrap command), and the applications themselves — chrome and its chromedriver are
# catalog artifacts the node script pulls through the control plane and unpacks. One image per Ubuntu
# version (`sw-linux-base:24.04`), never per browser version.
ARG UBUNTU_VERSION=24.04
FROM ubuntu:${UBUNTU_VERSION}

ENV DEBIAN_FRONTEND=noninteractive

# On networks where archive.ubuntu.com is unreachable (some RU clouds), point apt at a reachable mirror:
# --build-arg APT_MIRROR=mirror.yandex.ru. Empty = the stock mirrors.
ARG APT_MIRROR=
RUN if [ -n "${APT_MIRROR}" ]; then \
        sed -i "s|archive.ubuntu.com|${APT_MIRROR}|g; s|security.ubuntu.com|${APT_MIRROR}|g" \
            /etc/apt/sources.list.d/ubuntu.sources 2>/dev/null || true; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl unzip xz-utils bzip2 file jq procps \
        xvfb xauth x11-utils x11vnc websockify fluxbox \
        fonts-liberation fonts-noto-color-emoji \
        nodejs \
        libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
        libxdamage1 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0 libcairo2 libxss1 libgtk-3-0 \
        libx11-xcb1 libxfixes3 libdbus-1-3 libexpat1 libglib2.0-0 libvulkan1 xdg-utils \
        libdbus-glib-1-2 libxt6 \
    && rm -rf /var/lib/apt/lists/*

COPY bootstrap.sh /opt/sw/bootstrap.sh
RUN chmod +x /opt/sw/bootstrap.sh

EXPOSE 4444
CMD ["/opt/sw/bootstrap.sh"]
