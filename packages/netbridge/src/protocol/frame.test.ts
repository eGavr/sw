import { decode, encode, Frame, FrameType, maxDataBytes, NetBridgeFrameError } from "./frame";

describe("NetBridge frame codec", () => {
    test("should round-trip an open frame", () => {
        const frame: Frame = { type: FrameType.Open, streamId: 7, host: "localhost", port: 3000 };

        expect(decode(encode(frame))).toEqual(frame);
    });

    test("should round-trip an open frame whose host is an IPv6 literal with colons", () => {
        const frame: Frame = { type: FrameType.Open, streamId: 1, host: "::1", port: 8080 };

        expect(decode(encode(frame))).toEqual(frame);
    });

    test("should round-trip a data frame preserving the exact bytes", () => {
        const payload = Buffer.from([0x00, 0x01, 0xff, 0x7f, 0x00]);
        const decoded = decode(encode({ type: FrameType.Data, streamId: 42, payload }));

        expect(decoded.type).toBe(FrameType.Data);
        expect((decoded as { payload: Buffer }).payload.equals(payload)).toBe(true);
    });

    test("should round-trip an empty data frame", () => {
        const decoded = decode(encode({ type: FrameType.Data, streamId: 5, payload: Buffer.alloc(0) }));

        expect((decoded as { payload: Buffer }).payload.length).toBe(0);
    });

    test("should round-trip a data frame at the size cap", () => {
        const payload = Buffer.alloc(maxDataBytes, 0xab);
        const decoded = decode(encode({ type: FrameType.Data, streamId: 9, payload }));

        expect((decoded as { payload: Buffer }).payload.equals(payload)).toBe(true);
    });

    test("should round-trip a close frame", () => {
        const frame: Frame = { type: FrameType.Close, streamId: 0xffffffff };

        expect(decode(encode(frame))).toEqual(frame);
    });

    test("should reject a message shorter than the header", () => {
        expect(() => decode(Buffer.from([FrameType.Data, 0x00]))).toThrow(NetBridgeFrameError);
    });

    test("should reject an unknown frame type", () => {
        const message = Buffer.alloc(5);
        message.writeUInt8(99, 0);

        expect(() => decode(message)).toThrow(NetBridgeFrameError);
    });

    test("should reject an open frame missing its host", () => {
        // type + streamId + port, but no host bytes
        const message = Buffer.alloc(7);
        message.writeUInt8(FrameType.Open, 0);
        message.writeUInt16BE(3000, 5);

        expect(() => decode(message)).toThrow(NetBridgeFrameError);
    });

    test("should reject encoding a data frame over the size cap", () => {
        const payload = Buffer.alloc(maxDataBytes + 1);

        expect(() => encode({ type: FrameType.Data, streamId: 1, payload })).toThrow(NetBridgeFrameError);
    });

    test("should reject encoding an out-of-range port", () => {
        expect(() => encode({ type: FrameType.Open, streamId: 1, host: "localhost", port: 0 })).toThrow(NetBridgeFrameError);
        expect(() => encode({ type: FrameType.Open, streamId: 1, host: "localhost", port: 70000 })).toThrow(NetBridgeFrameError);
    });

    test("should reject encoding an out-of-range stream id", () => {
        expect(() => encode({ type: FrameType.Close, streamId: -1 })).toThrow(NetBridgeFrameError);
        expect(() => encode({ type: FrameType.Close, streamId: 0x1_0000_0000 })).toThrow(NetBridgeFrameError);
    });
});
