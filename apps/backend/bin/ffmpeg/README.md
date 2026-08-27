# Static ffmpeg binaries (session video recording)

Environments record session video with a static ffmpeg fetched at startup from the internal control
plane (`GET /internal/ffmpeg:download?arch=<amd64|arm64>`, served by `InternalAgentController` from
`INTERNAL_FFMPEG_DIR`, default `bin/ffmpeg`). The binaries live here as `ffmpeg-<arch>` and are **not**
committed (see `.gitignore`) — they are large and reproducible.

Provision them per environment:

- **Local dev (Apple Silicon → `seleniarm` arm64 nodes):**

  ```sh
  curl -fsSL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz \
    | tar -xJ --strip-components=1 -C /tmp/ffmpeg-arm64 --wildcards '*/ffmpeg'
  install -m 0755 /tmp/ffmpeg-arm64/ffmpeg bin/ffmpeg/ffmpeg-arm64
  ```

- **Prod image (amd64 nodes):** the `Dockerfile` copies a static ffmpeg into `bin/ffmpeg/ffmpeg-amd64`
  from the `selenium/ffmpeg` image (a minimal static build with x11grab + libx264), so no runtime fetch
  from a third party is needed in the cluster.

If the binary for a node's architecture is absent, `ffmpeg:download` returns 404 and the agent simply
skips video recording (best effort) — sessions are unaffected.
