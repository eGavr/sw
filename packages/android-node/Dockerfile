FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive ANDROID_HOME=/opt/android-sdk

# On networks where deb.debian.org is unreachable (e.g. some RU clouds), point apt at a reachable mirror.
# Harmless elsewhere; drop the sed if the default mirrors are fine for your build host.
RUN (sed -i "s|deb.debian.org|mirror.yandex.ru|g; s|security.debian.org|mirror.yandex.ru|g" \
        /etc/apt/sources.list.d/debian.sources 2>/dev/null || true) \
    && apt-get update \
    && apt-get install -y --no-install-recommends android-tools-adb nginx curl ca-certificates procps jq \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p "$ANDROID_HOME/platform-tools" && ln -sf "$(command -v adb)" "$ANDROID_HOME/platform-tools/adb"

# npmmirror because npmjs.org times out from some RU clouds; swap back to the default registry elsewhere.
RUN npm config set registry https://registry.npmmirror.com \
    && npm install -g appium \
    && appium driver install uiautomator2

COPY nginx.conf /opt/android-node/nginx.conf
COPY status-shim.js /opt/android-node/status-shim.js
COPY start.sh /opt/android-node/start.sh
RUN chmod +x /opt/android-node/start.sh

EXPOSE 4444
CMD ["/opt/android-node/start.sh"]
