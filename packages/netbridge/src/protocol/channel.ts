// The client leg of a NetBridge tunnel multiplexes many forwarders (one per remote environment) over the
// client's single WebSocket. Each message on that leg is a channel envelope: a 1-byte op, a 4-byte channel
// id (which forwarder), and, for Data, an opaque inner frame the rendezvous never parses:
//   Data  [1][channelId:4][inner…]  — an inner mux frame for that forwarder's stream space
//   Close [2][channelId:4]          — the forwarder is gone; tear down its streams
// The forwarder leg carries bare inner frames (no envelope) — it is 1:1 with the rendezvous.
export enum ChannelOp {
    Data = 1,
    Close = 2,
}

export type ChannelMessage =
    | { readonly op: ChannelOp.Data; readonly channelId: number; readonly inner: Buffer }
    | { readonly op: ChannelOp.Close; readonly channelId: number };

const headerSize = 5;
const maxChannelId = 0xffffffff;

export class NetBridgeChannelError extends Error {}

export function encodeChannelData(channelId: number, inner: Buffer): Buffer {
    const buffer = Buffer.allocUnsafe(headerSize + inner.length);

    writeHeader(buffer, ChannelOp.Data, channelId);
    inner.copy(buffer, headerSize);

    return buffer;
}

export function encodeChannelClose(channelId: number): Buffer {
    const buffer = Buffer.allocUnsafe(headerSize);

    writeHeader(buffer, ChannelOp.Close, channelId);

    return buffer;
}

export function decodeChannel(message: Buffer): ChannelMessage {
    if (message.length < headerSize) {
        throw new NetBridgeChannelError("channel message is shorter than its header");
    }

    const op = message.readUInt8(0);
    const channelId = message.readUInt32BE(1);

    switch (op) {
        case ChannelOp.Data:
            return { op: ChannelOp.Data, channelId, inner: message.subarray(headerSize) };
        case ChannelOp.Close:
            return { op: ChannelOp.Close, channelId };
        default:
            throw new NetBridgeChannelError(`unknown channel op ${op}`);
    }
}

function writeHeader(buffer: Buffer, op: ChannelOp, channelId: number): void {
    if (!Number.isInteger(channelId) || channelId < 0 || channelId > maxChannelId) {
        throw new NetBridgeChannelError(`channel id out of range: ${channelId}`);
    }

    buffer.writeUInt8(op, 0);
    buffer.writeUInt32BE(channelId, 1);
}
