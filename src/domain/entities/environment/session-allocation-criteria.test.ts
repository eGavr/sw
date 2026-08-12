import { Application } from "./application/application";
import { EnvironmentState } from "./environment-state";
import { SessionAllocationCriteria } from "./session-allocation-criteria";

describe("SessionAllocationCriteria", () => {
    test("forms a free-and-fresh predicate for the requested application", () => {
        const now = new Date(10_000);

        const predicate = SessionAllocationCriteria
            .from(now, 6_000, Application.fromObject({ name: "chrome", version: "100" }))
            .toPredicate();

        expect(predicate).toEqual({
            state: EnvironmentState.Executing,
            busy: false,
            heartbeatCutoff: new Date(4_000),
            applicationName: "chrome",
            applicationVersion: "100",
        });
    });
});
