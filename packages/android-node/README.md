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

## Interactive VNC

Watching and driving a live Android session works exactly like a browser session: the create-session
response advertises `sw:vnc` / `sw:interactive`, and the wd WS proxy routes `/session/{id}/se/vnc` here.
The pipeline (started by `start.sh`) is:

    redroid → scrcpy → Xvfb :99 → x11vnc :5900 → websockify :7900 → (nginx /se/vnc) → wd proxy → noVNC

- **scrcpy** mirrors the device and injects input back into it (so the viewer has full control).
- **Xvfb** is the headless display scrcpy renders into; **openbox** keeps scrcpy's window focused for keys.
- **x11vnc** exports the display over VNC (no password — access is gated by the unguessable session id).
- **websockify** bridges VNC↔WebSocket for the browser.

scrcpy is **not** in Debian bookworm, so the image fetches the official portable Linux build (pinned +
sha256-verified). That build is **x86_64-only**, so the image must be built for `linux/amd64` — which matches
the redroid Compute VMs (also x86_64). Screen geometry defaults to the redroid device size (`720x1280`);
override with `SW_VNC_GEOMETRY` (e.g. `1080x1920x24`) if you boot redroid at another resolution.

## Build

    docker build --platform linux/amd64 -t sw/android-node:latest .

The companion is **version-agnostic** (one image for all Android versions); the Android OS version is the
redroid image tag (`redroid/redroid:13.0.0-latest` = Android 13), selected per environment by the adapter.

## Verifying VNC on a redroid host

The full chain can only be exercised on a host that actually runs redroid (a Linux box with the `binder_linux`
kernel module; on YC that is a cheap Compute VM — redroid is containerised, **KVM not needed**, unlike the
emulator). Bring up redroid + this companion, then inside the companion check each hop:

1. `adb -s 127.0.0.1:5555 shell getprop sys.boot_completed` → `1` (device up).
2. `DISPLAY=:99 xdpyinfo` succeeds and `pgrep -a scrcpy` is running (mirror rendered into Xvfb).
3. `curl -sI http://127.0.0.1:7900/` — websockify answers (VNC bridge up).
4. Open the session's `sw:interactive` URL in a browser → the Android screen appears and clicks/keys land.

Follow-up: server-side input filtering (true "view only") is intentionally not implemented — sessions are
always full-control.
