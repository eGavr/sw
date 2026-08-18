import { ProjectId } from "../project/project-id";

import { Application } from "./application/application";
import { ApplicationList } from "./application/application-list";
import { RequestedApplication } from "./application/requested-application";
import { Environment } from "./environment";
import { EnvironmentState } from "./environment-state";
import { Execution } from "./execution";
import { Platform } from "./platform/platform";
import { SessionAllocationCriteria } from "./session-allocation-criteria";

describe("SessionAllocationCriteria", () => {
    const now = new Date(10_000);

    const environmentWith = (version: string): Environment => Environment.create({
        projectId: ProjectId.create(),
        platform: Platform.fromObject({ name: "linux", version: "latest" }),
        applications: ApplicationList.create({ applications: [Application.create({ name: "chrome", version })] }),
    });

    const criteriaFor = (application: RequestedApplication): SessionAllocationCriteria =>
        SessionAllocationCriteria.from({ now, freshnessMs: 6_000, execution: Execution.Container, application });

    test("forms a free-and-fresh predicate for the requested application and execution substrate", () => {
        const predicate = criteriaFor(RequestedApplication.create({ name: "chrome", version: "100" })).toPredicate();

        expect(predicate).toEqual({
            state: EnvironmentState.Executing,
            busy: false,
            heartbeatCutoff: new Date(4_000),
            execution: Execution.Container,
            applicationName: "chrome",
            applicationVersion: "100",
        });
    });

    test("a latest request forms a predicate with a null version (match by name only)", () => {
        const predicate = criteriaFor(RequestedApplication.create({ name: "chrome" })).toPredicate();

        expect(predicate.applicationVersion).toBeNull();
    });

    test("ranks a latest request by newest installed version first", () => {
        const older = environmentWith("139");
        const newer = environmentWith("141");

        const ranked = criteriaFor(RequestedApplication.create({ name: "chrome" })).rank([older, newer]);

        expect(ranked.map((environment) => environment.applicationFor("chrome")?.version)).toEqual(["141", "139"]);
    });

    test("leaves an exact-version request in the given (load-spread) order", () => {
        const first = environmentWith("141");
        const second = environmentWith("141");

        const ranked = criteriaFor(RequestedApplication.create({ name: "chrome", version: "141" })).rank([first, second]);

        expect(ranked).toEqual([first, second]);
    });
});
