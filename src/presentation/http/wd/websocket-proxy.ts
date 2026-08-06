import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";

import { Injectable } from "@nestjs/common";
import { RawData, WebSocket, WebSocketServer } from "ws";

import { SessionRoute } from "./session-route";

// Maps a client upgrade path `/sessions/{id}/{rest}` to the upstream WebSocket URL by decoding the
// endpoint from the session id: `ws(s)://{endpoint}/session/{wdSessionId}/{rest}`. Returns null when
// the path or the session id is malformed.
export function resolveWebSocketTarget(url: string): string | null {
    const match = url.match(/^\/sessions\/([^/]+)\/(.+)$/);

    if (!match) {
        return null;
    }

    const route = SessionRoute.decode(match[1]);

    if (!route) {
        return null;
    }

    return `${route.endpoint.replace(/^http/, "ws")}/session/${route.webDriverSessionId}/${match[2]}`;
}

// Stateless reverse proxy for the WebSocket protocols (BiDi/DevTools/VNC). The upgrade path carries
// the routable session id, so any wd instance forwards frames to the right container without shared
// state. Access is by possession of the session id, like the HTTP command proxy — the upgrade is
// intentionally not authenticated.
@Injectable()
export class WebSocketProxy {
    private readonly server = new WebSocketServer({ noServer: true });

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
        const target = resolveWebSocketTarget(request.url ?? "");

        if (!target) {
            socket.destroy();

            return;
        }

        this.server.handleUpgrade(request, socket, head, (client) => this.pipe(client, target));
    }

    private pipe(client: WebSocket, target: string): void {
        const upstream = new WebSocket(target);
        const pending: Array<{ data: RawData; isBinary: boolean }> = [];

        upstream.on("open", () => {
            for (const frame of pending) {
                upstream.send(frame.data, { binary: frame.isBinary });
            }

            pending.length = 0;
        });

        client.on("message", (data, isBinary) => {
            if (upstream.readyState === WebSocket.OPEN) {
                upstream.send(data, { binary: isBinary });
            } else {
                pending.push({ data, isBinary });
            }
        });

        upstream.on("message", (data, isBinary) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data, { binary: isBinary });
            }
        });

        client.on("close", (code, reason) => this.forwardClose(upstream, code, reason));
        upstream.on("close", (code, reason) => this.forwardClose(client, code, reason));

        client.on("error", () => upstream.terminate());
        upstream.on("error", () => client.terminate());
    }

    private forwardClose(target: WebSocket, code: number, reason: Buffer): void {
        // Only 1000 and 3000–4999 are valid codes to send in a close frame; drop anything else.
        if (code === 1000 || (code >= 3000 && code <= 4999)) {
            target.close(code, reason);
        } else {
            target.close();
        }
    }
}
