#!/usr/bin/env bash
# Build the NetBridge forwarder for both linux arches into apps/backend/bin/netbridge/ (gitignored, like
# the ffmpeg binary). The control plane serves these to environments at
# GET /internal/netbridge:download?arch=<amd64|arm64>. Runs the Go toolchain in a container, so Go need
# not be installed on the host.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="$(cd "${here}/../../../apps/backend" && pwd)/bin/netbridge"
mkdir -p "${out}"

docker run --rm -v "${here}:/src" -v "${out}:/out" -w /src golang:1.23 sh -c '
  GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/netbridge-amd64 .
  GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o /out/netbridge-arm64 .
'

echo "built netbridge-amd64 + netbridge-arm64 -> ${out}"
