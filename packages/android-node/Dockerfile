FROM node:20-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive ANDROID_HOME=/opt/android-sdk

# On networks where deb.debian.org is unreachable (e.g. some RU clouds), point apt at a reachable mirror.
# Harmless elsewhere; drop the sed if the default mirrors are fine for your build host.
RUN (sed -i "s|deb.debian.org|mirror.yandex.ru|g; s|security.debian.org|mirror.yandex.ru|g" \
        /etc/apt/sources.list.d/debian.sources 2>/dev/null || true) \
    && apt-get update \
    && apt-get install -y --no-install-recommends android-tools-adb nginx curl ca-certificates procps jq \
        xvfb x11vnc websockify openbox libgl1-mesa-dri ffmpeg libsdl2-2.0-0 libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# scrcpy mirrors the device screen and injects input for the interactive VNC pipeline. It is not packaged in
# Debian bookworm, so fetch the official portable Linux build (x86_64, bundling scrcpy-server + adb; its
# runtime libs ffmpeg/SDL2/libusb are installed above). This is why the image must be built for linux/amd64 —
# which matches the redroid Compute VMs (x86_64). ADB points scrcpy at the same adb the companion connects with.
ARG SCRCPY_VERSION=4.1
ARG SCRCPY_SHA256=ad56ae8bfeedf41e824945c11dbf55fcb092b3e615b9b486f48a50e30d389635
RUN curl -fsSL "https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-linux-x86_64-v${SCRCPY_VERSION}.tar.gz" -o /tmp/scrcpy.tar.gz \
    && echo "${SCRCPY_SHA256}  /tmp/scrcpy.tar.gz" | sha256sum -c - \
    && mkdir -p /opt/scrcpy \
    && tar -xzf /tmp/scrcpy.tar.gz -C /opt/scrcpy --strip-components=1 \
    && rm /tmp/scrcpy.tar.gz \
    && ln -sf /opt/scrcpy/scrcpy /usr/local/bin/scrcpy
ENV SCRCPY_SERVER_PATH=/opt/scrcpy/scrcpy-server ADB=/usr/bin/adb

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
