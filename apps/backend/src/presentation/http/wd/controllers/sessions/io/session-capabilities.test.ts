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
            platform: undefined,
            application: { name: "chrome", version: "120" },
            applicationCapability: "browserName",
            logging: undefined,
            video: undefined,
            netBridge: undefined,
        });
    });

    test("names any application through sw:appName / sw:appVersion", () => {
        const params = resolveSessionRequest({
            alwaysMatch: { "sw:appName": "settings", "sw:appVersion": "14", "sw:projectId": "acc-1" },
        });

        expect(params.application).toEqual({ name: "settings", version: "14" });
        expect(params.applicationCapability).toBe("sw:appName");
    });

    test("an omitted sw:appVersion means latest", () => {
        const params = resolveSessionRequest({ alwaysMatch: { "sw:appName": "settings", "sw:projectId": "acc-1" } });

        expect(params.application).toEqual({ name: "settings", version: undefined });
    });

    test("rejects naming the application in both vocabularies", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:appName": "chrome" },
        })).toThrow(/name the application once/);
    });

    test("rejects a version capability that strays from its own name capability", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { ...alwaysMatch, "sw:appVersion": "120" },
        })).toThrow(/sw:appVersion/);
        expect(() => resolveSessionRequest({
            alwaysMatch: { "sw:appName": "settings", browserVersion: "14", "sw:projectId": "acc-1" },
        })).toThrow(/browserVersion/);
    });

    test("reads the W3C platformName, normalising the case Appium clients send", () => {
        expect(resolveSessionRequest({ alwaysMatch: { ...alwaysMatch, platformName: "Android" } }).platform)
            .toBe("android");
        expect(resolveSessionRequest({ alwaysMatch: { ...alwaysMatch, platformName: "linux" } }).platform)
            .toBe("linux");
    });

    test("leaves the platform unset when platformName is omitted (any platform)", () => {
        expect(resolveSessionRequest({ alwaysMatch }).platform).toBeUndefined();
    });

    test("rejects an empty platformName", () => {
        expect(() => resolveSessionRequest({ alwaysMatch: { ...alwaysMatch, platformName: "" } }))
            .toThrow(/platformName/);
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

    test("requires the application to be named (browserName or sw:appName)", () => {
        expect(() => resolveSessionRequest({
            alwaysMatch: { browserVersion: "120", "sw:projectId": "acc-1" },
        })).toThrow(/"browserName" or "sw:appName" is required/);
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
