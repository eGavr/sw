import { firstReconnectDelayMs, maxReconnectDelayMs, reconnectDelayMs } from "./worker-connection";

describe("reconnectDelayMs", () => {
    test("retries a blink at once and backs off to a ceiling", () => {
        expect(reconnectDelayMs(1)).toBe(firstReconnectDelayMs);
        expect(reconnectDelayMs(2)).toBe(firstReconnectDelayMs * 2);
        expect(reconnectDelayMs(3)).toBe(firstReconnectDelayMs * 4);
        expect(reconnectDelayMs(99)).toBe(maxReconnectDelayMs);
    });

    test("a first attempt is never punished by arithmetic", () => {
        expect(reconnectDelayMs(0)).toBe(firstReconnectDelayMs);
    });
});
