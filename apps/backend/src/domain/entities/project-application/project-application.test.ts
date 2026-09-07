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
        test("registers builds and refuses a duplicate alias", () => {
            const application = chrome();

            application.addVersion({ alias: "152", appRef: "ref://152" });

            expect(() => application.addVersion({ alias: "152", appRef: "ref://again" }))
                .toThrow(ApplicationVersionConflictError);
        });

        test("the alias may not claim latest — that word is the ask vocabulary", () => {
            expect(() => chrome().addVersion({ alias: "latest", appRef: "ref://x" }))
                .toThrow(InvalidArgumentError);
        });

        test("a webdriver ref is paired to a build — it cannot come alone", () => {
            expect(() => chrome().addVersion({ alias: "1.0", webdriverRef: "ref://driver" }))
                .toThrow(InvalidArgumentError);
        });

        test("newestMatching: an ask is a build alias; null means the last registered", () => {
            const application = chrome();

            application.addVersion({ alias: "151", appRef: "ref://151" });
            application.addVersion({ alias: "152", appRef: "ref://152" });

            expect(application.newestMatching(null)?.alias).toBe("152");
            expect(application.newestMatching("151")?.alias).toBe("151");
            expect(application.newestMatching("150")).toBeNull();
        });
    });

    test("survives a persistence roundtrip", () => {
        const application = chrome();

        application.addVersion({ alias: "152", appRef: "ref://152", webdriverRef: "ref://driver" });

        const restored = ProjectApplication.fromObject(application.toObject());

        expect(restored.name).toBe("com.android.chrome");
        expect(restored.aliases).toEqual(["chrome"]);
        expect(restored.versionOf("152")?.webdriverRef).toBe("ref://driver");
    });
});
