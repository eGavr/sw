import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RawData, WebSocket, WebSocketServer } from "ws";

import {
    ProbeSessionLivenessUseCase,
} from "../../../application/use-cases/sessions/probe-session-liveness-use-case";
import { SessionRoute } from "../session-route";

export type WebSocketUpgrade = {
    readonly endpoint: string;
    readonly webDriverSessionId: string;
    readonly target: string;
};

const defaultPipeLivenessIntervalMs = 10_000;

// Maps a client upgrade path `/sessions/{id}/{rest}` to the upstream WebSocket URL by decoding the
// endpoint from the session id: `ws(s)://{endpoint}/session/{wdSessionId}/{rest}`. Returns null when
// the path or the session id is malformed.
export function resolveWebSocketUpgrade(url: string): WebSocketUpgrade | null {
    const match = url.match(/^\/sessions\/([^/]+)\/(.+)$/);

    if (!match) {
        return null;
    }

    const route = SessionRoute.decode(match[1]);

    if (!route) {
        return null;
    }

    return {
        endpoint: route.endpoint,
        webDriverSessionId: route.webDriverSessionId,
        target: `${route.endpoint.replace(/^http/, "ws")}/session/${route.webDriverSessionId}/${match[2]}`,
    };
}

// Stateless reverse proxy for the WebSocket protocols (BiDi/DevTools/VNC). The upgrade path carries
// the routable session id, so any wd instance forwards frames to the right container without shared
// state. Access is by possession of the session id, like the HTTP command proxy — the upgrade is
// intentionally not authenticated. The capability is the id of a LIVE session, and that stays true
// for the pipe's whole life: a connect for a dead session is refused, and an established pipe is
// re-validated against the node (never a session command) and torn down once its session dies —
// x11vnc serves the environment's display, not the session, so without this a viewer would outlive
// its session and watch the environment's NEXT one.
@Injectable()
export class WebSocketProxy {
    private readonly server = new WebSocketServer({ noServer: true });
    private readonly pipeLivenessIntervalMs: number;

    constructor(
        private readonly probeSessionLiveness: ProbeSessionLivenessUseCase,
        configService: ConfigService,
    ) {
        this.pipeLivenessIntervalMs = Number(
            configService.get<string>("WD_PIPE_LIVENESS_INTERVAL_MS") ?? String(defaultPipeLivenessIntervalMs),
        );
    }

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
        const upgrade = resolveWebSocketUpgrade(request.url ?? "");

        if (!upgrade) {
            socket.destroy();

            return;
        }

        void this.upgradeAlive(request, socket, head, upgrade);
    }

    private async upgradeAlive(
        request: IncomingMessage,
        socket: Duplex,
        head: Buffer,
        upgrade: WebSocketUpgrade,
    ): Promise<void> {
        if (!(await this.isAlive(upgrade))) {
            socket.destroy();

            return;
        }

        this.server.handleUpgrade(request, socket, head, (client) => this.pipe(client, upgrade));
    }

    private pipe(client: WebSocket, upgrade: WebSocketUpgrade): void {
        const upstream = new WebSocket(upgrade.target);
        const pending: Array<{ data: RawData; isBinary: boolean }> = [];

        // The pipe lives exactly as long as its session: once the session dies the capability that
        // opened this pipe is spent, whatever the display underneath keeps showing.
        const watchdog = setInterval(() => {
            void this.isAlive(upgrade).then((alive) => {
                if (!alive) {
                    client.close(1000, "session ended");
                    upstream.close();
                }
            });
        }, this.pipeLivenessIntervalMs);
        watchdog.unref();

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

        client.on("close", (code, reason) => {
            clearInterval(watchdog);
            this.forwardClose(upstream, code, reason);
        });
        upstream.on("close", (code, reason) => {
            clearInterval(watchdog);
            this.forwardClose(client, code, reason);
        });

        client.on("error", () => upstream.terminate());
        upstream.on("error", () => client.terminate());
    }

    private isAlive(upgrade: WebSocketUpgrade): Promise<boolean> {
        return this.probeSessionLiveness
            .execute({ endpoint: upgrade.endpoint, webDriverSessionId: upgrade.webDriverSessionId })
            .catch(() => false);
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
