import { Injectable } from "@nestjs/common";
import { ChannelOp, decodeChannel, encodeChannelClose, encodeChannelData } from "@sw/netbridge";

// The minimal socket the registry drives — a WebSocket in production, a fake in tests. Keeps the fan-in
// logic (the part worth unit-testing) free of the `ws` server plumbing.
export interface NetBridgeSocket {
    send(data: Buffer): void;
    close(): void;
}

type ProjectTunnel = {
    client: NetBridgeSocket;
    forwarders: Map<number, NetBridgeSocket>;
    nextChannelId: number;
};

// The live routing table of a NetBridge tunnel, per project: one attached client fanning in many
// forwarders (one per remote environment). Frames from a forwarder are wrapped with its channel id and
// sent to the client; channel messages from the client are unwrapped and routed to the addressed
// forwarder. All identity-checked so a reconnecting client's stale socket can never disturb the new one.
//
// State is in-process: a forwarder and its client must land on the same wd instance. That holds for the
// single-instance deployment; horizontal scale would need a shared broker (as the WebSocket proxy notes
// for its own bookkeeping).
@Injectable()
export class NetBridgeRegistry {
    private readonly tunnels = new Map<string, ProjectTunnel>();

    // The client registers first; a reconnecting client replaces the previous one, whose socket and
    // forwarders are dropped with it.
    attachClient(projectId: string, client: NetBridgeSocket): void {
        const existing = this.tunnels.get(projectId);

        if (existing) {
            existing.client.close();

            for (const forwarder of existing.forwarders.values()) {
                forwarder.close();
            }
        }

        this.tunnels.set(projectId, { client, forwarders: new Map(), nextChannelId: 1 });
    }

    hasClient(projectId: string): boolean {
        return this.tunnels.has(projectId);
    }

    // Attach a forwarder under the project's client and give it a channel id in that client's space.
    // Null when no client is attached — the forwarder cannot be served, so the caller refuses it.
    attachForwarder(projectId: string, forwarder: NetBridgeSocket): number | null {
        const tunnel = this.tunnels.get(projectId);

        if (!tunnel) {
            return null;
        }

        const channelId = tunnel.nextChannelId;

        tunnel.nextChannelId += 1;
        tunnel.forwarders.set(channelId, forwarder);

        return channelId;
    }

    relayToClient(projectId: string, channelId: number, forwarder: NetBridgeSocket, data: Buffer): void {
        const tunnel = this.tunnels.get(projectId);

        if (!tunnel || tunnel.forwarders.get(channelId) !== forwarder) {
            return;
        }

        tunnel.client.send(encodeChannelData(channelId, data));
    }

    relayToForwarder(projectId: string, client: NetBridgeSocket, message: Buffer): void {
        const tunnel = this.tunnels.get(projectId);

        if (!tunnel || tunnel.client !== client) {
            return;
        }

        const decoded = decodeChannel(message);
        const forwarder = tunnel.forwarders.get(decoded.channelId);

        if (!forwarder) {
            return;
        }

        if (decoded.op === ChannelOp.Close) {
            tunnel.forwarders.delete(decoded.channelId);
            forwarder.close();

            return;
        }

        forwarder.send(decoded.inner);
    }

    // A forwarder disconnected: drop it and tell the client the channel is gone.
    detachForwarder(projectId: string, channelId: number, forwarder: NetBridgeSocket): void {
        const tunnel = this.tunnels.get(projectId);

        if (!tunnel || tunnel.forwarders.get(channelId) !== forwarder) {
            return;
        }

        tunnel.forwarders.delete(channelId);
        tunnel.client.send(encodeChannelClose(channelId));
    }

    // The client disconnected: drop the tunnel and close every forwarder — none can be served now.
    detachClient(projectId: string, client: NetBridgeSocket): void {
        const tunnel = this.tunnels.get(projectId);

        if (!tunnel || tunnel.client !== client) {
            return;
        }

        for (const forwarder of tunnel.forwarders.values()) {
            forwarder.close();
        }

        this.tunnels.delete(projectId);
    }
}
