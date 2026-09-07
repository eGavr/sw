import { ProjectId } from "../project/project-id";

import { ApplicationList } from "./application/application-list";
import { ApplicationMatch } from "./application/application-match";
import { RequestedApplication, RequestedApplicationParams } from "./application/requested-application";
import { Environment } from "./environment";
import { EnvironmentEndpoint } from "./environment-endpoint";
import { EnvironmentOccupancy } from "./environment-occupancy";
import { EnvironmentState } from "./environment-state";
import { IncompatibleSessionTargetError } from "./error/incompatible-session-target-error";
import { NoAllocatableEnvironmentError } from "./error/no-allocatable-environment-error";
import {
    NoEnvironmentOffersApplicationError,
} from "./error/no-environment-offers-application-error";
import { TargetEnvironmentNotReadyError } from "./error/target-environment-not-ready-error";
import { Execution } from "./execution";
import { Platform } from "./platform/platform";
import { RequestedPlatform } from "./platform/requested-platform";
import { SessionAllocationCriteria } from "./session-allocation-criteria";

describe("SessionAllocationCriteria", () => {
    const now = new Date(10_000);

    // Allocatable environments are always detected (detection rides registration), so the fixture
    // carries the detected layer.
    const environmentWith = (version: string, platformName: string = "ubuntu"): Environment => Environment.create({
        projectId: ProjectId.create(),
        platform: Platform.fromObject(platformName === "android"
            ? { name: "android", version: "14", deviceModel: "pixel-7" }
            : { name: "ubuntu", version: "24.04", deviceModel: "desktop" }),
        applications: ApplicationList.fromObject([{ nameAlias: "chrome", versionAlias: "b", version }]),
    });

    // The catalog's expansion, reproduced bare: the requested name itself and the version as prefix.
    const matchFor = (application: RequestedApplication): ApplicationMatch =>
        ApplicationMatch.create({ names: [application.name], versionAsk: application.version() });

    const criteriaFor = (
        application: RequestedApplication,
        platform: RequestedPlatform = RequestedPlatform.any(),
    ): SessionAllocationCriteria =>
        SessionAllocationCriteria.from({
            now, freshnessMs: 6_000, execution: Execution.Container, platform, application, match: matchFor(application),
        });

    test("forms a free-and-fresh predicate for the requested application and execution substrate", () => {
        const predicate = criteriaFor(RequestedApplication.create({ name: "chrome", version: "100" })).toPredicate();

        expect(predicate).toEqual({
            state: EnvironmentState.Executing,
            occupancy: EnvironmentOccupancy.Free,
            heartbeatCutoff: new Date(4_000),
            execution: Execution.Container,
            platformNames: null,
            platformVersionAsk: null,
            deviceModel: null,
            applicationNames: ["chrome"],
            applicationVersionAsk: "100",
        });
    });

    test("a latest request forms a predicate with a null version ask (match by name only)", () => {
        const predicate = criteriaFor(RequestedApplication.create({ name: "chrome" })).toPredicate();

        expect(predicate.applicationVersionAsk).toBeNull();
    });

    test("an asked platform narrows the predicate to the concrete platforms it opens onto", () => {
        const chrome = RequestedApplication.create({ name: "chrome" });

        expect(criteriaFor(chrome, RequestedPlatform.create({ name: "linux" })).toPredicate().platformNames)
            .toEqual(["ubuntu"]);
        expect(criteriaFor(chrome, RequestedPlatform.create({ name: "android" })).toOfferPredicate().platformNames)
            .toEqual(["android"]);
    });

    test("an asked platform version and device kind ride into the predicate, the device folded to its id", () => {
        const chrome = RequestedApplication.create({ name: "chrome" });
        const predicate = criteriaFor(chrome, RequestedPlatform.create({ version: "14", deviceModel: "Pixel 7" }))
            .toPredicate();

        expect(predicate.platformNames).toBeNull();
        expect(predicate.platformVersionAsk).toBe("14");
        expect(predicate.deviceModel).toBe("pixel-7");
    });

    test("the offer predicate relaxes to every still-viable state, keeping the request shape", () => {
        const offer = criteriaFor(RequestedApplication.create({ name: "chrome", version: "100" })).toOfferPredicate();

        expect(offer).toEqual({
            states: [
                EnvironmentState.Enqueued,
                EnvironmentState.Starting,
                EnvironmentState.Preparing,
                EnvironmentState.Executing,
            ],
            execution: Execution.Container,
            platformNames: null,
            platformVersionAsk: null,
            deviceModel: null,
            applicationNames: ["chrome"],
            applicationVersionAsk: "100",
        });
    });

    describe("refuseAllocation (why an empty pool is refused)", () => {
        const criteria = criteriaFor(RequestedApplication.create({ name: "chrome", version: "141" }));

        test("a transient shortage (something offers the request) is a retryable conflict", () => {
            expect(() => criteria.refuseAllocation(true)).toThrow(NoAllocatableEnvironmentError);
        });

        test("nothing offering the request is a failed precondition — retrying is pointless", () => {
            expect(() => criteria.refuseAllocation(false)).toThrow(NoEnvironmentOffersApplicationError);
            expect(() => criteria.refuseAllocation(false)).toThrow(/chrome 141 on container — create one first/);
        });

        test("names the asked platform parts in the refusal", () => {
            const onAndroid = criteriaFor(
                RequestedApplication.create({ name: "chrome", version: "141" }),
                RequestedPlatform.create({ name: "android", version: "14", deviceModel: "Pixel 7" }),
            );

            expect(() => onAndroid.refuseAllocation(false)).toThrow(/chrome 141 on android 14 pixel-7 container/);
        });

        test("a pool taken in the race is refused as the same transient shortage", () => {
            expect(() => criteria.refuseTransientShortage()).toThrow(NoAllocatableEnvironmentError);
        });
    });

    test("ranks a latest request by newest installed version first", () => {
        const older = environmentWith("139");
        const newer = environmentWith("141");

        const ranked = criteriaFor(RequestedApplication.create({ name: "chrome" })).rank([older, newer]);

        expect(ranked.map((environment) => environment.applicationFor("chrome")?.version)).toEqual(["141", "139"]);
    });

    test("a version-prefix request admits any version it opens and ranks the newest first", () => {
        const older = environmentWith("141.0.7390.54");
        const newer = environmentWith("141.0.7401.12");

        const criteria = criteriaFor(RequestedApplication.create({ name: "chrome", version: "141" }));

        expect(() => criteria.rank([older, newer])).not.toThrow();
        expect(criteria.rank([older, newer]).map((environment) => environment.applicationFor("chrome")?.version))
            .toEqual(["141.0.7401.12", "141.0.7390.54"]);
    });

    test("leaves same-version candidates in the given (load-spread) order", () => {
        const first = environmentWith("141");
        const second = environmentWith("141");

        const ranked = criteriaFor(RequestedApplication.create({ name: "chrome", version: "141" })).rank([first, second]);

        expect(ranked).toEqual([first, second]);
    });

    describe("admit (targeted allocation)", () => {
        const executingEnvironmentWith = (
            version: string,
            heartbeatAt: Date = now,
            platformName: string = "ubuntu",
        ): Environment => {
            const environment = environmentWith(version, platformName);

            environment.claim();
            environment.markDispatched();
            environment.register(new EnvironmentEndpoint("http://127.0.0.1:4444"), heartbeatAt);

            return environment;
        };

        const criteria = (
            application: RequestedApplicationParams = { name: "chrome", version: "141" },
        ): SessionAllocationCriteria => criteriaFor(RequestedApplication.create(application));

        test("admits a matching free executing environment with a fresh heartbeat", () => {
            expect(() => criteria().admit(executingEnvironmentWith("141"))).not.toThrow();
        });

        test("a latest request admits any offered version", () => {
            expect(() => criteria({ name: "chrome" }).admit(executingEnvironmentWith("139"))).not.toThrow();
        });

        test("a version-prefix request admits the full version it opens", () => {
            expect(() => criteria({ name: "chrome", version: "141" })
                .admit(executingEnvironmentWith("141.0.7390.54"))).not.toThrow();
        });

        test("an alias-expanded match admits an environment installed under the canonical name", () => {
            const requested = RequestedApplication.create({ name: "chrome" });
            const aliasAware = SessionAllocationCriteria.from({
                now,
                freshnessMs: 6_000,
                execution: Execution.Container,
                platform: RequestedPlatform.any(),
                application: requested,
                match: ApplicationMatch.create({ names: ["chrome", "com.android.chrome"], versionAsk: null }),
            });
            const canonical = Environment.create({
                projectId: ProjectId.create(),
                platform: Platform.fromObject({ name: "ubuntu", version: "24.04", deviceModel: "desktop" }),
                applications: ApplicationList.fromObject([
                    { nameAlias: "com.android.chrome", version: "152.0.7977.82" },
                ]),
            });

            canonical.claim();
            canonical.markDispatched();
            canonical.register(new EnvironmentEndpoint("http://127.0.0.1:4444"), now);

            expect(() => aliasAware.admit(canonical)).not.toThrow();
        });

        test("rejects as incompatible when the environment lacks the application", () => {
            expect(() => criteria({ name: "firefox" }).admit(executingEnvironmentWith("141")))
                .toThrow(IncompatibleSessionTargetError);
        });

        test("rejects as incompatible when the offered version differs from the exact request", () => {
            expect(() => criteria({ name: "chrome", version: "999" }).admit(executingEnvironmentWith("141")))
                .toThrow(IncompatibleSessionTargetError);
        });

        test("rejects as incompatible on another execution substrate", () => {
            const requested = RequestedApplication.create({ name: "chrome", version: "141" });
            const emulator = SessionAllocationCriteria.from({
                now,
                freshnessMs: 6_000,
                execution: Execution.Emulator,
                platform: RequestedPlatform.any(),
                application: requested,
                match: matchFor(requested),
            });

            expect(() => emulator.admit(executingEnvironmentWith("141"))).toThrow(IncompatibleSessionTargetError);
        });

        test("admits the platform the request asks for, a family word opening onto its platforms", () => {
            const chrome = RequestedApplication.create({ name: "chrome", version: "141" });

            expect(() => criteriaFor(chrome, RequestedPlatform.create({ name: "linux" }))
                .admit(executingEnvironmentWith("141"))).not.toThrow();
            expect(() => criteriaFor(chrome, RequestedPlatform.create({ name: "android" }))
                .admit(executingEnvironmentWith("141", now, "android"))).not.toThrow();
        });

        test("admits by platform version prefix and device kind", () => {
            const chrome = RequestedApplication.create({ name: "chrome", version: "141" });
            const android = executingEnvironmentWith("141", now, "android");

            expect(() => criteriaFor(chrome, RequestedPlatform.create({ version: "14", deviceModel: "Pixel 7" }))
                .admit(android)).not.toThrow();
            expect(() => criteriaFor(chrome, RequestedPlatform.create({ version: "13" })).admit(android))
                .toThrow(IncompatibleSessionTargetError);
            expect(() => criteriaFor(chrome, RequestedPlatform.create({ deviceModel: "pixel-3a" })).admit(android))
                .toThrow(/on pixel-3a container/);
        });

        test("rejects as incompatible on another platform", () => {
            const chrome = RequestedApplication.create({ name: "chrome", version: "141" });

            expect(() => criteriaFor(chrome, RequestedPlatform.create({ name: "android" }))
                .admit(executingEnvironmentWith("141"))).toThrow(IncompatibleSessionTargetError);
            expect(() => criteriaFor(chrome, RequestedPlatform.create({ name: "android" }))
                .admit(executingEnvironmentWith("141"))).toThrow(/on android container/);
        });

        test("rejects as not ready while the environment is still provisioning", () => {
            expect(() => criteria().admit(environmentWith("141"))).toThrow(TargetEnvironmentNotReadyError);
        });

        test("rejects as not ready when the environment is busy", () => {
            const environment = executingEnvironmentWith("141");
            environment.heartbeat(true, now);

            expect(() => criteria().admit(environment)).toThrow(TargetEnvironmentNotReadyError);
        });

        test("rejects as not ready when the heartbeat went stale", () => {
            const stale = executingEnvironmentWith("141", new Date(now.getTime() - 60_000));

            expect(() => criteria().admit(stale)).toThrow(TargetEnvironmentNotReadyError);
        });
    });
});
