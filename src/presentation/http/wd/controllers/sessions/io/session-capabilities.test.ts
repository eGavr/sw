import { resolveSessionRequest } from "./session-capabilities";

describe("resolveSessionRequest", () => {
    const alwaysMatch = {
        browserName: "chrome",
        browserVersion: "120",
        "sw:accountId": "acc-1",
    };

    test("resolves the application and account from a W3C alwaysMatch envelope", () => {
        expect(resolveSessionRequest({ alwaysMatch })).toEqual({
            accountId: "acc-1",
            execution: "container",
            application: { name: "chrome", version: "120" },
            logging: undefined,
            video: undefined,
        });
    });

    test("defaults the execution substrate to container when sw:execution is omitted", () => {
        expect(resolveSessionRequest({ alwaysMatch }).execution).toBe("container");
    });

    test("reads the requested execution substrate from sw:execution", () => {
        const params = resolveSessionRequest({ alwaysMatch: { ...alwaysMatch, "sw:execution": "emulator" } });

        expect(params.execution).toBe("emulator");
    });

    test("rejects an unknown execution substrate", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:execution": "bare-metal" },
        })).toThrow(/sw:execution/);
    });

    test("reads the sw:* opt-ins as booleans", () => {
        const params = resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:logging": true, "sw:video": false },
        });

        expect(params.logging).toBe(true);
        expect(params.video).toBe(false);
    });

    test("merges the first firstMatch entry on top of alwaysMatch", () => {
        const params = resolveSessionRequest({
            alwaysMatch: { "sw:accountId": "acc-1", browserName: "chrome" },
            firstMatch: [{ browserVersion: "120" }, { browserVersion: "121" }],
        });

        expect(params.application).toEqual({ name: "chrome", version: "120" });
    });

    test("rejects a capability redefined in both alwaysMatch and firstMatch", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, browserVersion: "120" },
            firstMatch: [{ browserVersion: "121" }],
        })).toThrow(/both alwaysMatch and firstMatch/);
    });

    test("requires sw:accountId", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { browserName: "chrome", browserVersion: "120" },
        })).toThrow(/sw:accountId/);
    });

    test("requires browserName", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { browserVersion: "120", "sw:accountId": "acc-1" },
        })).toThrow(/browserName/);
    });

    test("rejects a non-boolean opt-in", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:logging": "yes" },
        })).toThrow(/sw:logging/);
    });

    test("rejects a non-object alwaysMatch", () => {
        expect(() => resolveSessionRequest({ alwaysMatch: "chrome" })).toThrow(/alwaysMatch/);
    });

    test("rejects a non-array firstMatch", () => {
        expect(() => resolveSessionRequest({ alwaysMatch, firstMatch: {} })).toThrow(/firstMatch/);
    });
});
