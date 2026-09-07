# The VNC pipeline of an android pool slot, as a container — for hosts that have docker but no X stack
# (a dev Mac acting as a pool host). The pool-host agent starts one per seat when it finds this image;
# a linux host with Xvfb/x11vnc/websockify/scrcpy installed runs the same pipeline natively and never
# needs it. The container reaches the emulator over its adb port (SW_ADB_TARGET) and publishes the
# websockify bridge on 7900, which the agent maps to the slot's loopback ws port.
#
# scrcpy is built from source: the distro package (1.25) predates Android 14 support, and the official
# prebuilt tarball is x86_64 only, while a Mac builds this image for arm64. 3.3.x is the last line on
# SDL2 (4.x wants SDL3, which the LTS base does not ship). The server jar is the official prebuilt —
# it must match the client version byte for byte, so it is pinned by checksum.
FROM ubuntu:24.04 AS scrcpy-build

ENV DEBIAN_FRONTEND=noninteractive
ARG SCRCPY_VERSION=3.3.4
ARG SCRCPY_SOURCE_SHA256=03b72d1f71ca7783cff2995ca7cd8c67b9b75038a3cc35e443a1913e951b49dd
ARG SCRCPY_SERVER_SHA256=8588238c9a5a00aa542906b6ec7e6d5541d9ffb9b5d0f6e1bc0e365e2303079e

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gcc pkg-config ninja-build meson \
        libavcodec-dev libavdevice-dev libavformat-dev libavutil-dev libswresample-dev libsdl2-dev libusb-1.0-0-dev \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/Genymobile/scrcpy/archive/refs/tags/v${SCRCPY_VERSION}.tar.gz" -o /tmp/scrcpy.tar.gz \
    && echo "${SCRCPY_SOURCE_SHA256}  /tmp/scrcpy.tar.gz" | sha256sum -c - \
    && curl -fsSL "https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}" \
        -o /tmp/scrcpy-server \
    && echo "${SCRCPY_SERVER_SHA256}  /tmp/scrcpy-server" | sha256sum -c - \
    && mkdir -p /tmp/scrcpy && tar -xzf /tmp/scrcpy.tar.gz -C /tmp/scrcpy --strip-components=1 \
    && cd /tmp/scrcpy \
    && meson setup build --buildtype=release --strip -Db_lto=true -Dprebuilt_server=/tmp/scrcpy-server \
    && ninja -C build install

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        adb xvfb x11vnc websockify openbox libgl1-mesa-dri ffmpeg libsdl2-2.0-0 libusb-1.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=scrcpy-build /usr/local/bin/scrcpy /usr/local/bin/scrcpy
COPY --from=scrcpy-build /usr/local/share/scrcpy /usr/local/share/scrcpy
COPY entrypoint.sh /opt/sw/entrypoint.sh

EXPOSE 7900
ENTRYPOINT ["bash", "/opt/sw/entrypoint.sh"]
