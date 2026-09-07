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

    describe("versions", () => {
        test("registers builds and refuses a duplicate", () => {
            const application = chrome();

            application.addVersion({ version: "152.0.7977.82", appRef: "ref://152" });

            expect(() => application.addVersion({ version: "152.0.7977.82", appRef: "ref://again" }))
                .toThrow(ApplicationVersionConflictError);
        });

        test("a build's version must be concrete", () => {
            expect(() => chrome().addVersion({ version: "latest", appRef: "ref://x" }))
                .toThrow(NonConcreteApplicationVersionError);
        });

        test("a webdriver ref is paired to a build — it cannot come alone", () => {
            expect(() => chrome().addVersion({ version: "1.0", webdriverRef: "ref://driver" }))
                .toThrow(InvalidArgumentError);
        });

        test("newestMatching honours the segment prefix and picks the newest", () => {
            const application = chrome();

            application.addVersion({ version: "151.0.7890.10", appRef: "ref://151" });
            application.addVersion({ version: "152.0.7977.82", appRef: "ref://152" });

            expect(application.newestMatching(null)?.version).toBe("152.0.7977.82");
            expect(application.newestMatching("151")?.version).toBe("151.0.7890.10");
            expect(application.newestMatching("150")).toBeNull();
        });

        test("versionsNewestFirst orders for pickers", () => {
            const application = chrome();

            application.addVersion({ version: "151.0.7890.10", appRef: "ref://151" });
            application.addVersion({ version: "152.0.7977.82", appRef: "ref://152" });

            expect(application.versionsNewestFirst().map((version) => version.version))
                .toEqual(["152.0.7977.82", "151.0.7890.10"]);
        });
    });

    test("survives a persistence roundtrip", () => {
        const application = chrome();

        application.addVersion({ version: "152.0.7977.82", appRef: "ref://152", webdriverRef: "ref://driver" });

        const restored = ProjectApplication.fromObject(application.toObject());

        expect(restored.name).toBe("com.android.chrome");
        expect(restored.aliases).toEqual(["chrome"]);
        expect(restored.versionOf("152.0.7977.82")?.webdriverRef).toBe("ref://driver");
    });
});
