import {
    ChannelOp,
    decode,
    decodeChannel,
    encode,
    encodeChannelData,
    FrameType,
    maxDataBytes,
} from "@sw/netbridge";

// A live connection to a target on the user's network, abstracted so the mux logic can be unit-tested
// without real sockets. The node implementation wraps a net.Socket (see index.ts).
export interface ExitConnection {
    write(data: Buffer): void;
    end(): void;
    destroy(): void;
    onData(handler: (chunk: Buffer) => void): void;
    onClose(handler: () => void): void;
}

export type Dial = (host: string, port: number) => Promise<ExitConnection>;

// The exit end of a NetBridge tunnel. It receives channel-framed messages from the control plane — each
// carrying one forwarder's inner mux frame — resolves Open by dialing the target on the user's network
// (names resolved HERE, so private DNS works), and relays bytes back wrapped in the same channel. A
// stream is keyed by (channel, stream): the channel is which remote environment, the stream is one of
// the browser's connections within it.
export class TunnelClient {
    private readonly connections = new Map<string, ExitConnection>();

    constructor(
        private readonly send: (message: Buffer) => void,
        private readonly dial: Dial,
        private readonly allows: (host: string) => boolean,
    ) {}

    handle(message: Buffer): void {
        const channel = decodeChannel(message);

        if (channel.op === ChannelOp.Close) {
            this.closeChannel(channel.channelId);

            return;
        }

        const frame = decode(channel.inner);

        switch (frame.type) {
            case FrameType.Open:
                void this.open(channel.channelId, frame.streamId, frame.host, frame.port);

                return;
            case FrameType.Data:
                this.connections.get(streamKey(channel.channelId, frame.streamId))?.write(frame.payload);

                return;
            case FrameType.Close:
                this.close(channel.channelId, frame.streamId);

                return;
        }
    }

    closeAll(): void {
        for (const connection of this.connections.values()) {
            connection.destroy();
        }

        this.connections.clear();
    }

    private async open(channelId: number, streamId: number, host: string, port: number): Promise<void> {
        if (!this.allows(host)) {
            this.sendClose(channelId, streamId);

            return;
        }

        let connection: ExitConnection;

        try {
            connection = await this.dial(host, port);
        } catch {
            this.sendClose(channelId, streamId);

            return;
        }

        const key = streamKey(channelId, streamId);

        this.connections.set(key, connection);
        connection.onData((chunk) => this.forward(channelId, streamId, chunk));
        connection.onClose(() => {
            if (this.connections.delete(key)) {
                this.sendClose(channelId, streamId);
            }
        });
    }

    // A read from the target becomes Data frames back over the channel, chunked so no single frame
    // exceeds the wire cap.
    private forward(channelId: number, streamId: number, chunk: Buffer): void {
        for (let offset = 0; offset < chunk.length; offset += maxDataBytes) {
            const slice = chunk.subarray(offset, offset + maxDataBytes);

            this.send(encodeChannelData(channelId, encode({ type: FrameType.Data, streamId, payload: slice })));
        }
    }

    private close(channelId: number, streamId: number): void {
        const key = streamKey(channelId, streamId);
        const connection = this.connections.get(key);

        if (connection) {
            this.connections.delete(key);
            connection.end();
        }
    }

    private closeChannel(channelId: number): void {
        const prefix = `${channelId}:`;

        for (const [key, connection] of this.connections) {
            if (key.startsWith(prefix)) {
                this.connections.delete(key);
                connection.destroy();
            }
        }
    }

    private sendClose(channelId: number, streamId: number): void {
        this.send(encodeChannelData(channelId, encode({ type: FrameType.Close, streamId })));
    }
}

function streamKey(channelId: number, streamId: number): string {
    return `${channelId}:${streamId}`;
}
