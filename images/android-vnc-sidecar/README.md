# sw android VNC sidecar

The VNC pipeline of one android pool slot, packaged as a container for hosts that have docker but no
X stack — a dev Mac acting as a pool host. A linux pool host (leased metal) installs the same tools
natively (`scrcpy xvfb x11vnc websockify openbox`) and runs the pipeline in-process; this image exists
only so the Mac stand shows the same Live-VNC the metal host will.

```text
emulator (host, adb :5555+2i) ← adb connect ← scrcpy → Xvfb :99 → openbox → x11vnc :5900 → websockify :7900
                                                                                          ↑
                                        slot's wd door /session/{id}/se/vnc → 127.0.0.1:<vnc+2000> ─┘ (published)
```

- **scrcpy** mirrors the device onto the headless X display and injects the viewer's clicks and keys
  back — full control, not view-only. Built from source (the distro's 1.25 predates Android 14; the
  official prebuilt is x86_64 only) with the official prebuilt server jar, both pinned by checksum.
- **x11vnc** exports the display with no password: access is gated by possession of the unguessable
  session id, checked by the door.
- **websockify** bridges VNC to the WebSocket the door proxies; the agent publishes it on the slot's
  loopback ws port only — the door stays the one public surface.

## Build (once per Mac)

```bash
docker build -t sw-android-vnc-sidecar images/android-vnc-sidecar
```

The pool-host agent finds the image by name (`SW_VNC_SIDECAR_IMAGE` overrides) and starts one
container per seat, `sw-vnc-<environment id>`, restarted by the slot if it dies; without the image the
seat runs without VNC (sessions work, the viewer reports the route unavailable).

## Runtime contract

| env | meaning |
| --- | --- |
| `SW_ADB_TARGET` | `host:port` of the emulator's adb socket (`host.docker.internal:<console+1>`) |
| `SW_VNC_GEOMETRY` | the X display size, the device screen scaled to 1280 on the long side (`576x1280` for a Pixel 7) |

The container attaches with its **own** adb server (`adb connect`), never the host's — an adb client
of another version would kill the host's server and take every slot's `adb` with it.
