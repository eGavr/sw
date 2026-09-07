import { NonConcreteApplicationVersionError } from "../environment/error/non-concrete-application-version-error";
import { InvalidArgumentError } from "../error/invalid-argument-error";

import { ApplicationVersionConflictError } from "./error/application-version-conflict-error";
import { ProjectApplication } from "./project-application";

describe("ProjectApplication", () => {
    const chrome = (): ProjectApplication => ProjectApplication.create({
        projectId: "project-id",
        platformName: "android",
        name: "com.android.chrome",
        aliases: ["chrome"],
    });

    test("answers to its canonical name and every alias", () => {
        const application = chrome();

        expect(application.answersTo("com.android.chrome")).toBe(true);
        expect(application.answersTo("chrome")).toBe(true);
        expect(application.answersTo("firefox")).toBe(false);
    });

    test("rejects a malformed alias and duplicate words", () => {
        expect(() => ProjectApplication.create({
            projectId: "p", platformName: "android", name: "com.android.chrome", aliases: ["Chrome!"],
        })).toThrow(InvalidArgumentError);
        expect(() => ProjectApplication.create({
            projectId: "p", platformName: "android", name: "chrome", aliases: ["chrome"],
        })).toThrow(InvalidArgumentError);
    });

    describe("builds", () => {
        test("registers builds and refuses a colliding word (alias or declared version)", () => {
            const application = chrome();

            application.addVersion({ alias: "152", version: "152.0.7977.82", appRef: "ref://152" });

            expect(() => application.addVersion({ alias: "152", appRef: "ref://again" }))
                .toThrow(ApplicationVersionConflictError);
            expect(() => application.addVersion({ alias: "152.0.7977.82", appRef: "ref://sneaky" }))
                .toThrow(ApplicationVersionConflictError);
        });

        test("a declared version must be concrete, and the alias may not claim latest", () => {
            expect(() => chrome().addVersion({ alias: "152", version: "latest", appRef: "ref://x" }))
                .toThrow(NonConcreteApplicationVersionError);
            expect(() => chrome().addVersion({ alias: "latest", appRef: "ref://x" }))
                .toThrow(InvalidArgumentError);
        });

        test("a webdriver ref is paired to a build — it cannot come alone", () => {
            expect(() => chrome().addVersion({ alias: "1.0", webdriverRef: "ref://driver" }))
                .toThrow(InvalidArgumentError);
        });

        test("newestMatching honours alias, full version and segment prefix", () => {
            const application = chrome();

            application.addVersion({ alias: "151", version: "151.0.7890.10", appRef: "ref://151" });
            application.addVersion({ alias: "152", version: "152.0.7977.82", appRef: "ref://152" });

            expect(application.newestMatching(null)?.version).toBe("152.0.7977.82");
            expect(application.newestMatching("151")?.version).toBe("151.0.7890.10");
            expect(application.newestMatching("151.0.7890.10")?.alias).toBe("151");
            expect(application.newestMatching("150")).toBeNull();
        });

        test("an undeclared build (custom) orders by registration time and matches by alias only", () => {
            const application = ProjectApplication.create({
                projectId: "p", platformName: "android", name: "myapp",
            });

            const first = application.addVersion({ alias: "old", appRef: "builds/old.apk" });
            const second = application.addVersion({ alias: "new", appRef: "builds/new.apk" });

            expect(second.isNewerThan(first) || second.createdAt >= first.createdAt).toBe(true);
            expect(application.newestMatching("new")?.alias).toBe("new");
            expect(application.newestMatching("7.1")).toBeNull();
        });

        test("versionsNewestFirst orders for pickers", () => {
            const application = chrome();

            application.addVersion({ alias: "151", version: "151.0.7890.10", appRef: "ref://151" });
            application.addVersion({ alias: "152", version: "152.0.7977.82", appRef: "ref://152" });

            expect(application.versionsNewestFirst().map((version) => version.version))
                .toEqual(["152.0.7977.82", "151.0.7890.10"]);
        });
    });

    test("survives a persistence roundtrip", () => {
        const application = chrome();

        application.addVersion({
            alias: "152", version: "152.0.7977.82", appRef: "ref://152", webdriverRef: "ref://driver",
        });

        const restored = ProjectApplication.fromObject(application.toObject());

        expect(restored.name).toBe("com.android.chrome");
        expect(restored.aliases).toEqual(["chrome"]);
        expect(restored.versionOf("152")?.webdriverRef).toBe("ref://driver");
        expect(restored.versionOf("152.0.7977.82")?.alias).toBe("152");
    });
});
