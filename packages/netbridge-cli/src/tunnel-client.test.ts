import { ChannelOp, decode, decodeChannel, encode, encodeChannelClose, encodeChannelData, FrameType } from "@sw/netbridge";

import { Dial, ExitConnection, TunnelClient } from "./tunnel-client";

class FakeConnection implements ExitConnection {
    readonly writes: Array<Buffer> = [];
    ended = false;
    destroyed = false;

    private dataHandler?: (chunk: Buffer) => void;
    private closeHandler?: () => void;

    write(data: Buffer): void {
        this.writes.push(data);
    }

    end(): void {
        this.ended = true;
    }

    destroy(): void {
        this.destroyed = true;
    }

    onData(handler: (chunk: Buffer) => void): void {
        this.dataHandler = handler;
    }

    onClose(handler: () => void): void {
        this.closeHandler = handler;
    }

    emitData(chunk: Buffer): void {
        this.dataHandler?.(chunk);
    }

    emitClose(): void {
        this.closeHandler?.();
    }
}

const channelId = 3;
const streamId = 5;

const open = (host: string, port: number): Buffer =>
    encodeChannelData(channelId, encode({ type: FrameType.Open, streamId, host, port }));

const flush = (): Promise<void> => Promise.resolve();

describe("TunnelClient", () => {
    test("dials the target on Open and relays data both directions", async () => {
        const sent: Array<Buffer> = [];
        const connection = new FakeConnection();
        const dial: Dial = async () => connection;
        const client = new TunnelClient((message) => sent.push(message), dial, () => true);

        client.handle(open("localhost", 3000));
        await flush();

        client.handle(encodeChannelData(channelId, encode({ type: FrameType.Data, streamId, payload: Buffer.from("ping") })));
        expect(connection.writes[0].toString()).toBe("ping");

        connection.emitData(Buffer.from("pong"));
        const back = decodeChannel(sent[0]);
        expect(back.channelId).toBe(channelId);
        const inner = decode((back as { inner: Buffer }).inner);
        expect(inner.type).toBe(FrameType.Data);
        expect((inner as { payload: Buffer }).payload.toString()).toBe("pong");
    });

    test("refuses a target the egress policy denies, without dialing", async () => {
        const sent: Array<Buffer> = [];
        const dial = jest.fn<Promise<ExitConnection>, [string, number]>();
        const client = new TunnelClient((message) => sent.push(message), dial, (host) => host !== "169.254.169.254");

        client.handle(open("169.254.169.254", 80));
        await flush();

        expect(dial).not.toHaveBeenCalled();
        const inner = decode((decodeChannel(sent[0]) as { inner: Buffer }).inner);
        expect(inner.type).toBe(FrameType.Close);
    });

    test("ends the local connection when the browser closes its stream", async () => {
        const connection = new FakeConnection();
        const client = new TunnelClient(() => undefined, async () => connection, () => true);

        client.handle(open("localhost", 3000));
        await flush();

        client.handle(encodeChannelData(channelId, encode({ type: FrameType.Close, streamId })));
        expect(connection.ended).toBe(true);
    });

    test("tears down all of a channel's connections when the channel closes", async () => {
        const connection = new FakeConnection();
        const client = new TunnelClient(() => undefined, async () => connection, () => true);

        client.handle(open("localhost", 3000));
        await flush();

        client.handle(encodeChannelClose(channelId));
        expect(connection.destroyed).toBe(true);
    });

    test("reports a channel-close op is handled without touching other channels", () => {
        const client = new TunnelClient(() => undefined, async () => new FakeConnection(), () => true);

        expect(() => client.handle(encodeChannelClose(999))).not.toThrow();
        expect(ChannelOp.Close).toBe(2);
    });
});
