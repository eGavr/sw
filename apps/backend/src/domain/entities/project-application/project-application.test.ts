import { InvalidArgumentError } from "../error/invalid-argument-error";

import { ApplicationVersionConflictError } from "./error/application-version-conflict-error";
import { ProjectApplication } from "./project-application";

describe("ProjectApplication", () => {
    const chrome = (): ProjectApplication => ProjectApplication.create({
        projectId: "project-id",
        platformName: "android",
        nameAlias: "com.android.chrome",
    });

    describe("builds", () => {
        test("registers builds and refuses a duplicate alias", () => {
            const application = chrome();

            application.addVersion({ versionAlias: "152", appRef: "ref://152" });

            expect(() => application.addVersion({ versionAlias: "152", appRef: "ref://again" }))
                .toThrow(ApplicationVersionConflictError);
        });

        test("the alias may not claim latest — that word is the ask vocabulary", () => {
            expect(() => chrome().addVersion({ versionAlias: "latest", appRef: "ref://x" }))
                .toThrow(InvalidArgumentError);
        });

        test("a preinstalled build may bring the webdriver that drives it, with nothing to install", () => {
            const version = chrome().addVersion({ versionAlias: "113", webdriverRef: "ref://driver-113" });

            expect(version.appRef).toBeNull();
            expect(version.webdriverRef).toBe("ref://driver-113");
        });

        test("newestMatching: an ask is a build alias; null means the last registered", () => {
            const application = chrome();

            application.addVersion({ versionAlias: "151", appRef: "ref://151" });
            application.addVersion({ versionAlias: "152", appRef: "ref://152" });

            expect(application.newestMatching(null)?.versionAlias).toBe("152");
            expect(application.newestMatching("151")?.versionAlias).toBe("151");
            expect(application.newestMatching("150")).toBeNull();
        });
    });

    test("survives a persistence roundtrip", () => {
        const application = chrome();

        application.addVersion({ versionAlias: "152", appRef: "ref://152", webdriverRef: "ref://driver" });

        const restored = ProjectApplication.fromObject(application.toObject());

        expect(restored.nameAlias).toBe("com.android.chrome");
        expect(restored.versionOf("152")?.webdriverRef).toBe("ref://driver");
    });
});
