# NetBridge forwarder

A tiny static Go binary that runs **inside** a browser/appium environment. It exposes a loopback SOCKS5
proxy the browser is pointed at (`--proxy-server=socks5://127.0.0.1:<port>`) and tunnels every connection
over a single **outbound** WebSocket to the control-plane rendezvous (`/netbridge/agent`), authenticated
with the environment's per-env agent token. The remote browser thus reaches whatever the tunnel client
(on the user's machine) can reach. No inbound port is opened in the environment.

## Layout

- `protocol/` — the mux frame codec (Open/Data/Close), mirroring the TypeScript `@sw/netbridge` wire
  format (the source of truth). Unit-tested.
- `socks/` — the minimal SOCKS5 (RFC 1928) no-auth CONNECT negotiation; returns the target host:port
  (name resolved at the exit), never dials it. Unit-tested.
- `tunnel/` — the mux hub: one outbound WebSocket, many streams keyed by id.
- `main.go` — composition root: reads `SW_NETBRIDGE_URL`, `SW_INTERNAL_TOKEN`, `SW_NETBRIDGE_PROXY_PORT`
  and serves the SOCKS listener.

## Build

`./build.sh` cross-compiles both linux arches into `apps/backend/bin/netbridge/` (gitignored). The control
plane serves them at `GET /internal/netbridge:download?arch=<amd64|arm64>`. The Docker image builds them in
a `golang` stage (see the repo `Dockerfile`).

## Test

`docker run --rm -v "$PWD:/src" -w /src golang:1.23 go test ./...`
