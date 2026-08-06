import { EnvironmentData } from "../../../../domain/entities/environment/environment";
import { SessionData } from "../../../../domain/entities/session/session";

import { LocalComputeStore } from "./local-compute-store";

describe("LocalComputeStore", () => {
    const environmentData = (id: string, accountId: string): EnvironmentData => ({
        id,
        accountId,
        providerName: "Local",
        platform: { name: "linux", version: "22.04", deviceModel: null },
        applications: [{ name: "chrome", version: "100", kind: "browser" }],
        createdAt: new Date(0),
    });

    describe("environments", () => {
        test("should assign a default endpoint on save and read it back", () => {
            const store = new LocalComputeStore();
            const saved = store.saveEnvironment(environmentData("env-1", "acc-1"));

            expect(saved.endpoint).toBe("local://environments/env-1");
            expect(store.getEnvironment("env-1")?.endpoint).toBe("local://environments/env-1");
        });

        test("should list environments filtered by account", () => {
            const store = new LocalComputeStore();

            store.saveEnvironment(environmentData("env-1", "acc-1"));
            store.saveEnvironment(environmentData("env-2", "acc-2"));

            expect(store.listEnvironmentsByAccount("acc-1").map((environment) => environment.id)).toEqual(["env-1"]);
        });

        test("should remove an environment", () => {
            const store = new LocalComputeStore();

            store.saveEnvironment(environmentData("env-1", "acc-1"));
            store.removeEnvironment("env-1");

            expect(store.getEnvironment("env-1")).toBeNull();
        });
    });

    describe("sessions", () => {
        const sessionData = (id: string, environmentId: string): SessionData => ({
            id,
            environmentId,
            application: { name: "chrome", version: "100", kind: "browser" },
            idleTimeoutMs: 60_000,
            createdAt: new Date(0),
            lastActivityAt: new Date(0),
            webDriverSessionId: null,
        });

        test("should list sessions by environment", () => {
            const store = new LocalComputeStore();

            store.saveSession(sessionData("s-1", "env-1"));
            store.saveSession(sessionData("s-2", "env-2"));

            expect(store.listSessionsByEnvironment("env-1").map((session) => session.id)).toEqual(["s-1"]);
        });
    });
});
