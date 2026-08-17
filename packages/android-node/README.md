# android-node (companion)

The **companion** half of an Android environment. `redroid` gives a bare Android device reachable over
adb; this image turns that into a **WebDriver node** the `sw` control plane can talk to, exactly like a
stock Selenium browser node.

It runs as a **sidecar container sharing the redroid container's network namespace** (so the device's adb
is on `localhost:5555`). redroid runs Android as PID 1 and can't host these tools, hence a separate
container.

## What's inside

- **adb** — talks to the redroid device.
- **Appium + UiAutomator2** — the WebDriver server that drives the device.
- **nginx** (`nginx.conf`) — the single node surface on `:4444`: `/session*` → Appium, `/status` → the
  status shim, `/session/{id}/se/vnc` → the VNC bridge (websockify).
- **status shim** (`status-shim.js`, ~30 lines of Node) — reshapes Appium's `/sessions` into a
  Selenium-Grid-shaped `/status` so the stock heartbeat agent works unchanged.
- **start.sh** — the entrypoint that wires the above together.

The heartbeat agent (registration / liveness / log & video shipping) is **not** baked in — the compute
adapter injects it as the container command (`agentBootstrap`), fetched from the control plane at startup,
the same way browser nodes get it.

## Build

    docker build -t sw/android-node:latest .

The companion is **version-agnostic** (one image for all Android versions); the Android OS version is the
redroid image tag (`redroid/redroid:13.0.0-latest` = Android 13), selected per environment by the adapter.

## Follow-up

- **Interactive VNC is not wired in this image yet.** The pipeline is `redroid → scrcpy → Xvfb → x11vnc →
  websockify` (proven out-of-band); folding it in needs `scrcpy xvfb x11vnc websockify` in the image, which
  is why they are omitted here for now. Until then `/session/{id}/se/vnc` returns 502.
