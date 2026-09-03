import { resolveSessionRequest } from "./session-capabilities";

describe("resolveSessionRequest", () => {
    const alwaysMatch = {
        browserName: "chrome",
        browserVersion: "120",
        "sw:projectId": "acc-1",
    };

    test("resolves the application and project from a W3C alwaysMatch envelope", () => {
        expect(resolveSessionRequest({ alwaysMatch })).toEqual({
            projectId: "acc-1",
            execution: "container",
            application: { name: "chrome", version: "120" },
            logging: undefined,
            video: undefined,
            netBridge: undefined,
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

    test("reads the targeted environment from sw:environmentId", () => {
        const params = resolveSessionRequest({ alwaysMatch: { ...alwaysMatch, "sw:environmentId": "env-1" } });

        expect(params.environmentId).toBe("env-1");
    });

    test("leaves the target unset when sw:environmentId is omitted (pool allocation)", () => {
        expect(resolveSessionRequest({ alwaysMatch }).environmentId).toBeUndefined();
    });

    test("rejects an empty sw:environmentId", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:environmentId": "" },
        })).toThrow(/sw:environmentId/);
    });

    test("reads the sw:* opt-ins as booleans", () => {
        const params = resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:logging": true, "sw:video": false, "sw:netbridge": true },
        });

        expect(params.logging).toBe(true);
        expect(params.video).toBe(false);
        expect(params.netBridge).toBe(true);
    });

    test("merges the first firstMatch entry on top of alwaysMatch", () => {
        const params = resolveSessionRequest({
            alwaysMatch: { "sw:projectId": "acc-1", browserName: "chrome" },
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

    test("requires sw:projectId", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { browserName: "chrome", browserVersion: "120" },
        })).toThrow(/sw:projectId/);
    });

    test("requires browserName", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { browserVersion: "120", "sw:projectId": "acc-1" },
        })).toThrow(/browserName/);
    });

    test("resolves an omitted browserVersion to no version (meaning latest)", () => {
        const params = resolveSessionRequest({ alwaysMatch: { browserName: "chrome", "sw:projectId": "acc-1" } });

        expect(params.application).toEqual({ name: "chrome", version: undefined });
    });

    test("passes the reserved 'latest' browserVersion through to the domain", () => {
        const params = resolveSessionRequest({
            alwaysMatch: { browserName: "chrome", browserVersion: "latest", "sw:projectId": "acc-1" },
        });

        expect(params.application).toEqual({ name: "chrome", version: "latest" });
    });

    test("rejects an empty browserVersion when present", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { browserName: "chrome", browserVersion: "", "sw:projectId": "acc-1" },
        })).toThrow(/browserVersion/);
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
