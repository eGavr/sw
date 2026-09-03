import { ChannelOp, decodeChannel, encodeChannelClose, encodeChannelData } from "@sw/netbridge";

import { NetBridgeRegistry, NetBridgeSocket } from "./net-bridge-registry";

class FakeSocket implements NetBridgeSocket {
    readonly sent: Array<Buffer> = [];
    closed = false;

    send(data: Buffer): void {
        this.sent.push(data);
    }

    close(): void {
        this.closed = true;
    }
}

const project = "project-1";

describe("NetBridgeRegistry", () => {
    let registry: NetBridgeRegistry;

    beforeEach(() => {
        registry = new NetBridgeRegistry();
    });

    test("wraps a forwarder frame with its channel id and sends it to the client", () => {
        const client = new FakeSocket();
        const forwarder = new FakeSocket();

        registry.attachClient(project, client);
        const channelId = registry.attachForwarder(project, forwarder);

        registry.relayToClient(project, channelId as number, forwarder, Buffer.from([0xaa, 0xbb]));

        expect(client.sent).toHaveLength(1);
        const decoded = decodeChannel(client.sent[0]);
        expect(decoded).toMatchObject({ op: ChannelOp.Data, channelId });
        expect((decoded as { inner: Buffer }).inner.equals(Buffer.from([0xaa, 0xbb]))).toBe(true);
    });

    test("unwraps a channel-data message from the client and routes it to the addressed forwarder", () => {
        const client = new FakeSocket();
        const forwarder = new FakeSocket();

        registry.attachClient(project, client);
        const channelId = registry.attachForwarder(project, forwarder) as number;

        registry.relayToForwarder(project, client, encodeChannelData(channelId, Buffer.from([0x01, 0x02])));

        expect(forwarder.sent).toHaveLength(1);
        expect(forwarder.sent[0].equals(Buffer.from([0x01, 0x02]))).toBe(true);
    });

    test("fans in multiple forwarders on distinct channels and routes back to the right one", () => {
        const client = new FakeSocket();
        const first = new FakeSocket();
        const second = new FakeSocket();

        registry.attachClient(project, client);
        const firstChannel = registry.attachForwarder(project, first) as number;
        const secondChannel = registry.attachForwarder(project, second) as number;

        expect(firstChannel).not.toBe(secondChannel);

        registry.relayToForwarder(project, client, encodeChannelData(secondChannel, Buffer.from([0x09])));

        expect(first.sent).toHaveLength(0);
        expect(second.sent[0].equals(Buffer.from([0x09]))).toBe(true);
    });

    test("refuses a forwarder when no client is attached", () => {
        expect(registry.attachForwarder(project, new FakeSocket())).toBeNull();
    });

    test("a channel-close message from the client closes and drops that forwarder", () => {
        const client = new FakeSocket();
        const forwarder = new FakeSocket();

        registry.attachClient(project, client);
        const channelId = registry.attachForwarder(project, forwarder) as number;

        registry.relayToForwarder(project, client, encodeChannelClose(channelId));

        expect(forwarder.closed).toBe(true);
    });

    test("detaching a forwarder tells the client the channel is gone", () => {
        const client = new FakeSocket();
        const forwarder = new FakeSocket();

        registry.attachClient(project, client);
        const channelId = registry.attachForwarder(project, forwarder) as number;

        registry.detachForwarder(project, channelId, forwarder);

        const decoded = decodeChannel(client.sent[0]);
        expect(decoded).toEqual({ op: ChannelOp.Close, channelId });
    });

    test("detaching the client closes all its forwarders and drops the tunnel", () => {
        const client = new FakeSocket();
        const forwarder = new FakeSocket();

        registry.attachClient(project, client);
        registry.attachForwarder(project, forwarder);

        registry.detachClient(project, client);

        expect(forwarder.closed).toBe(true);
        expect(registry.attachForwarder(project, new FakeSocket())).toBeNull();
    });

    test("a reconnecting client replaces the old one, closing its socket and forwarders", () => {
        const oldClient = new FakeSocket();
        const oldForwarder = new FakeSocket();
        const newClient = new FakeSocket();

        registry.attachClient(project, oldClient);
        registry.attachForwarder(project, oldForwarder);

        registry.attachClient(project, newClient);

        expect(oldClient.closed).toBe(true);
        expect(oldForwarder.closed).toBe(true);
    });

    test("a stale old-client relay and detach do not disturb the new tunnel", () => {
        const oldClient = new FakeSocket();
        const newClient = new FakeSocket();
        const forwarder = new FakeSocket();

        registry.attachClient(project, oldClient);
        registry.attachClient(project, newClient);
        const channelId = registry.attachForwarder(project, forwarder) as number;

        // The old client's socket lingers and its handlers still fire — they must be ignored.
        registry.relayToForwarder(project, oldClient, encodeChannelData(channelId, Buffer.from([0x07])));
        registry.detachClient(project, oldClient);

        expect(forwarder.sent).toHaveLength(0);
        expect(forwarder.closed).toBe(false);
        expect(registry.hasClient(project)).toBe(true);
    });
});
