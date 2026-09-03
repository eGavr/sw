// Wire format for the NetBridge multiplexer. Exactly one WebSocket message carries one frame, so the
// rendezvous in the control plane routes whole frames by stream without parsing the payload. A frame
// is a 1-byte type, a 4-byte stream id, and a type-specific tail:
//   Open  [1][streamId:4][port:2][host…]  — a new TCP stream to host:port (the name is resolved at the exit)
//   Data  [2][streamId:4][bytes…]         — payload for an open stream
//   Close [3][streamId:4]                 — the stream is finished in the sender's direction
export enum FrameType {
    Open = 1,
    Data = 2,
    Close = 3,
}

export type OpenFrame = {
    readonly type: FrameType.Open;
    readonly streamId: number;
    readonly host: string;
    readonly port: number;
};

export type DataFrame = {
    readonly type: FrameType.Data;
    readonly streamId: number;
    readonly payload: Buffer;
};

export type CloseFrame = {
    readonly type: FrameType.Close;
    readonly streamId: number;
};

export type Frame = OpenFrame | DataFrame | CloseFrame;

// Payload cap for a Data frame: the forwarder chunks a TCP stream into pieces no larger than this so a
// single WebSocket message never grows unbounded. The header (type + stream id) is not counted.
export const maxDataBytes = 64 * 1024;

const headerSize = 5;
const openPortSize = 2;
const maxStreamId = 0xffffffff;
const maxPort = 0xffff;

export class NetBridgeFrameError extends Error {}

export function encode(frame: Frame): Buffer {
    switch (frame.type) {
        case FrameType.Open:
            return encodeOpen(frame);
        case FrameType.Data:
            return encodeData(frame);
        case FrameType.Close:
            return encodeHeader(FrameType.Close, frame.streamId);
    }
}

export function decode(message: Buffer): Frame {
    if (message.length < headerSize) {
        throw new NetBridgeFrameError("frame is shorter than its header");
    }

    const type = message.readUInt8(0);
    const streamId = message.readUInt32BE(1);

    switch (type) {
        case FrameType.Open:
            return decodeOpen(message, streamId);
        case FrameType.Data:
            return { type: FrameType.Data, streamId, payload: message.subarray(headerSize) };
        case FrameType.Close:
            return { type: FrameType.Close, streamId };
        default:
            throw new NetBridgeFrameError(`unknown frame type ${type}`);
    }
}

function encodeOpen(frame: OpenFrame): Buffer {
    assertPort(frame.port);

    const host = Buffer.from(frame.host, "utf8");

    if (host.length === 0) {
        throw new NetBridgeFrameError("open frame requires a host");
    }

    const buffer = Buffer.allocUnsafe(headerSize + openPortSize + host.length);

    writeHeader(buffer, FrameType.Open, frame.streamId);
    buffer.writeUInt16BE(frame.port, headerSize);
    host.copy(buffer, headerSize + openPortSize);

    return buffer;
}

function encodeData(frame: DataFrame): Buffer {
    if (frame.payload.length > maxDataBytes) {
        throw new NetBridgeFrameError(`data frame exceeds ${maxDataBytes} bytes`);
    }

    const buffer = Buffer.allocUnsafe(headerSize + frame.payload.length);

    writeHeader(buffer, FrameType.Data, frame.streamId);
    frame.payload.copy(buffer, headerSize);

    return buffer;
}

function encodeHeader(type: FrameType, streamId: number): Buffer {
    const buffer = Buffer.allocUnsafe(headerSize);

    writeHeader(buffer, type, streamId);

    return buffer;
}

function writeHeader(buffer: Buffer, type: FrameType, streamId: number): void {
    assertStreamId(streamId);
    buffer.writeUInt8(type, 0);
    buffer.writeUInt32BE(streamId, 1);
}

function decodeOpen(message: Buffer, streamId: number): OpenFrame {
    if (message.length < headerSize + openPortSize) {
        throw new NetBridgeFrameError("open frame is missing its port");
    }

    const port = message.readUInt16BE(headerSize);
    const host = message.subarray(headerSize + openPortSize).toString("utf8");

    if (host.length === 0) {
        throw new NetBridgeFrameError("open frame is missing its host");
    }

    return { type: FrameType.Open, streamId, host, port };
}

function assertStreamId(streamId: number): void {
    if (!Number.isInteger(streamId) || streamId < 0 || streamId > maxStreamId) {
        throw new NetBridgeFrameError(`stream id out of range: ${streamId}`);
    }
}

function assertPort(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > maxPort) {
        throw new NetBridgeFrameError(`port out of range: ${port}`);
    }
}
