# linux-base

The base image of a linux environment: an Ubuntu release, a headless display stack (Xvfb, x11vnc,
websockify, fluxbox), fonts and the runtime libraries a Chromium-family browser needs. Nothing
sw-specific is baked in — at start the image's `bootstrap.sh` fetches the linux node script from the
control plane, which brings up the display, pulls the environment's applications (chrome and its paired
chromedriver are catalog artifacts, delivered through `…/applications/{word}:downloadApp|:downloadWebdriver`),
detects the delivered version, starts chromedriver and the wd door (the Selenium-Grid-shaped `/status`,
the one-session rule, the idle timeout and the BiDi/DevTools/VNC websocket routes the control plane
expects), while the heartbeat agent injected by the compute gateway registers the environment.

One image per Ubuntu version, never per browser version — the browser is data.

## Build

Chrome for Testing publishes linux builds for amd64 only, so the image is built for `linux/amd64`
(on an arm64 Mac docker runs it under qemu — slow, but it works for a dev e2e):

```bash
docker buildx build --platform linux/amd64 --build-arg UBUNTU_VERSION=24.04 \
  -t sw-linux-base:24.04 --load images/linux-base
# RU networks: --build-arg APT_MIRROR=mirror.yandex.ru
```

## Control-plane config

```
COMPUTE_DOCKER_BASE_IMAGE=sw-linux-base:{version}   # {version} = the environment's platform.version
COMPUTE_DOCKER_PLATFORM=linux/amd64                 # needed on an arm64 docker host
COMPUTE_DOCKER_SCREEN_WIDTH=1360                    # Xvfb geometry (also the video record size)
COMPUTE_DOCKER_SCREEN_HEIGHT=1020
```

## Dev stand on Apple Silicon

Chrome for Testing has no linux/arm64 build and its amd64 chrome crashes under QEMU, so on an arm64
Mac the image is built natively and the browser is a **custom application** of the project — an arm64
Chromium with an arm64 chromedriver of the same major (verified end to end with Playwright's Chromium
140 build and Electron 38's chromedriver):

```bash
docker buildx build --platform linux/arm64 --build-arg UBUNTU_VERSION=24.04 \
  -t sw-linux-base:24.04 --load images/linux-base
# COMPUTE_DOCKER_PLATFORM stays unset (native)

curl -X POST $API/v1/projects/$PROJECT/platforms/ubuntu/applications -H "$AUTH" \
  -H 'content-type: application/json' -d '{"nameAlias":"chromium"}'
curl -X POST $API/v1/projects/$PROJECT/platforms/ubuntu/applications/chromium/versions -H "$AUTH" \
  -H 'content-type: application/json' -d '{
    "versionAlias": "140-arm64",
    "appRef": "https://playwright.azureedge.net/builds/chromium/1187/chromium-linux-arm64.zip",
    "webdriverRef": "https://github.com/electron/electron/releases/download/v38.0.0/chromedriver-v38.0.0-linux-arm64.zip"
  }'
# then an environment with {"nameAlias":"chromium","versionAlias":"140-arm64"} and a session with
# browserName: chromium — the node reports the detected version (140.0.7339.16).
```

The wd door names the browser `chrome` towards chromedriver whatever word the environment used, so a
custom Chromium works exactly like the catalog's chrome.
