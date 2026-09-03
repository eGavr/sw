import { ChannelOp, decodeChannel, encodeChannelClose, encodeChannelData, NetBridgeChannelError } from "./channel";

describe("NetBridge channel codec", () => {
    test("should round-trip a data envelope preserving the inner bytes", () => {
        const inner = Buffer.from([0x01, 0x00, 0x05, 0xff]);
        const decoded = decodeChannel(encodeChannelData(7, inner));

        expect(decoded.op).toBe(ChannelOp.Data);
        expect(decoded.channelId).toBe(7);
        expect((decoded as { inner: Buffer }).inner.equals(inner)).toBe(true);
    });

    test("should round-trip a close envelope", () => {
        const decoded = decodeChannel(encodeChannelClose(0xffffffff));

        expect(decoded).toEqual({ op: ChannelOp.Close, channelId: 0xffffffff });
    });

    test("should reject a message shorter than the header", () => {
        expect(() => decodeChannel(Buffer.from([ChannelOp.Data, 0x00]))).toThrow(NetBridgeChannelError);
    });

    test("should reject an unknown op", () => {
        const message = Buffer.alloc(5);
        message.writeUInt8(99, 0);

        expect(() => decodeChannel(message)).toThrow(NetBridgeChannelError);
    });

    test("should reject encoding an out-of-range channel id", () => {
        expect(() => encodeChannelData(-1, Buffer.alloc(0))).toThrow(NetBridgeChannelError);
        expect(() => encodeChannelClose(0x1_0000_0000)).toThrow(NetBridgeChannelError);
    });
});
