import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";

import { Injectable } from "@nestjs/common";
import { RawData, WebSocket, WebSocketServer } from "ws";

import {
    AuthenticateNetBridgeClientUseCase,
} from "../../../application/use-cases/net-bridge-tunnel/authenticate-net-bridge-client-use-case";
import {
    AuthenticateNetBridgeForwarderUseCase,
} from "../../../application/use-cases/net-bridge-tunnel/authenticate-net-bridge-forwarder-use-case";

import { NetBridgeRegistry, NetBridgeSocket } from "./net-bridge-registry";

// The laptop/CI tunnel client attaches here (authenticated by its access key); the in-environment
// forwarder attaches here (authenticated by its per-environment agent token).
const clientPath = "/netbridge/client";
const forwarderPath = "/netbridge/agent";

// The rendezvous where the two outbound legs of a NetBridge tunnel meet: the client dials in from the
// user's machine, the forwarder dials out from the remote environment, and the control plane glues them
// by project. Both legs are ordinary WebSocket upgrades on the wd server; possession of a valid access
// key (client) or agent token (forwarder) is the capability, so unlike the WebDriver session proxy these
// upgrades ARE authenticated — the tunnel bridges into a private network.
@Injectable()
export class NetBridgeRendezvous {
    private readonly server = new WebSocketServer({ noServer: true });

    constructor(
        private readonly registry: NetBridgeRegistry,
        private readonly authenticateClient: AuthenticateNetBridgeClientUseCase,
        private readonly authenticateForwarder: AuthenticateNetBridgeForwarderUseCase,
    ) {}

    // Whether this upgrade is a tunnel upgrade — the caller falls through to the WebDriver proxy otherwise.
    handles(url: string | undefined): boolean {
        const path = pathOf(url);

        return path === clientPath || path === forwarderPath;
    }

    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
        if (pathOf(request.url) === clientPath) {
            void this.acceptClient(request, socket, head);

            return;
        }

        void this.acceptForwarder(request, socket, head);
    }

    private async acceptClient(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
        const secret = bearer(request);

        if (!secret) {
            socket.destroy();

            return;
        }

        const projectId = await this.resolve(() => this.authenticateClient.execute({ creds: { secret } }));

        if (!projectId) {
            socket.destroy();

            return;
        }

        this.server.handleUpgrade(request, socket, head, (ws) => this.registerClient(projectId, ws));
    }

    private registerClient(projectId: string, ws: WebSocket): void {
        const client = toSocket(ws);

        this.registry.attachClient(projectId, client);
        ws.on("message", (data) => this.registry.relayToForwarder(projectId, client, toBuffer(data)));
        ws.on("close", () => this.registry.detachClient(projectId, client));
        ws.on("error", () => ws.terminate());
    }

    private async acceptForwarder(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
        const environmentToken = bearer(request);

        if (!environmentToken) {
            socket.destroy();

            return;
        }

        const projectId = await this.resolve(
            () => this.authenticateForwarder.execute({ creds: { environmentToken } }),
        );

        if (!projectId) {
            socket.destroy();

            return;
        }

        this.server.handleUpgrade(request, socket, head, (ws) => this.registerForwarder(projectId, ws));
    }

    private registerForwarder(projectId: string, ws: WebSocket): void {
        const forwarder = toSocket(ws);
        const channelId = this.registry.attachForwarder(projectId, forwarder);

        if (channelId === null) {
            // No tunnel client is attached for this project — start the client before running sessions.
            ws.close();

            return;
        }

        ws.on("message", (data) => this.registry.relayToClient(projectId, channelId, forwarder, toBuffer(data)));
        ws.on("close", () => this.registry.detachForwarder(projectId, channelId, forwarder));
        ws.on("error", () => ws.terminate());
    }

    private async resolve(authenticate: () => Promise<{ getValue(): string }>): Promise<string | null> {
        try {
            return (await authenticate()).getValue();
        } catch {
            return null;
        }
    }
}

function pathOf(url: string | undefined): string {
    return (url ?? "").split("?")[0];
}

function bearer(request: IncomingMessage): string | null {
    const authorization = request.headers.authorization ?? "";

    return authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : null;
}

function toSocket(ws: WebSocket): NetBridgeSocket {
    return {
        send: (data): void => ws.send(data),
        close: (): void => ws.close(),
    };
}

function toBuffer(data: RawData): Buffer {
    if (Array.isArray(data)) {
        return Buffer.concat(data);
    }

    return Buffer.isBuffer(data) ? data : Buffer.from(data);
}
