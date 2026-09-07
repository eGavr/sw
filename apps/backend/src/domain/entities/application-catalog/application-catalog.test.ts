import { RequestedApplication } from "../environment/application/requested-application";
import { ProjectApplication } from "../project-application/project-application";

import { ApplicationCatalog } from "./application-catalog";
import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";

describe("ApplicationCatalog", () => {
    const provided = (
        platformName: string,
        name: string,
        versions: Array<{ versionAlias: string; appRef?: string; webdriverRef?: string }>,
    ): ProjectApplication => {
        const application = ProjectApplication.create({ projectId: "catalog-id", platformName, nameAlias: name });

        versions.forEach((version) => application.addVersion(version));

        return application;
    };

    const custom = (
        platformName: string,
        name: string,
        versions: Array<{ versionAlias: string; appRef: string; webdriverRef?: string }>,
    ): ProjectApplication => {
        const application = ProjectApplication.create({ projectId: "project-id", platformName, nameAlias: name });

        versions.forEach((version) => application.addVersion(version));

        return application;
    };

    const catalog = ApplicationCatalog.of({
        catalog: [
            // One word per application, the same on every platform it exists on; identity is
            // detected on the device, never declared here.
            provided("ubuntu", "chrome", [
                { versionAlias: "151", appRef: "ref://chrome-151" },
                { versionAlias: "152", appRef: "ref://chrome-152", webdriverRef: "ref://driver-152" },
            ]),
            provided("android", "chrome", [{ versionAlias: "152", appRef: "ref://chrome-apk-152" }]),
            provided("android", "settings", [{ versionAlias: "14" }]),
        ],
        own: [
            custom("android", "com.mycorp.app", [
                { versionAlias: "7.1-rc2", appRef: "builds/app-7.1.apk", webdriverRef: "builds/driver-7.1" },
            ]),
            // The project's own chrome: overrides the catalog's under the same word.
            custom("ubuntu", "chrome", [{ versionAlias: "nightly", appRef: "builds/chrome-nightly.zip" }]),
        ],
    });

    describe("resolve (create-environment: loose word → concrete build)", () => {
        test("a word with no ask resolves to the last registered build", () => {
            const application = catalog.resolve("android", RequestedApplication.create({ name: "chrome" }));

            expect(application.nameAlias).toBe("chrome");
            expect(application.versionAlias).toBe("152");
            expect(application.source.isCustom()).toBe(false);
            expect(application.source.appRef).toBe("ref://chrome-apk-152");
        });

        test("the project's own word overrides the catalog's: its build wins, as a custom", () => {
            const application = catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome" }));

            expect(application.versionAlias).toBe("nightly");
            expect(application.source.isCustom()).toBe(true);
            expect(application.source.appRef).toBe("builds/chrome-nightly.zip");
        });

        test("a version ask addresses a build by its alias — within the overriding set only", () => {
            expect(() => catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome", version: "151" })))
                .toThrow(ApplicationNotInCatalogError);
        });

        test("a preinstalled build resolves with nothing to deliver", () => {
            const application = catalog.resolve("android", RequestedApplication.create({ name: "settings" }));

            expect(application.versionAlias).toBe("14");
            expect(application.source.appRef).toBeNull();
        });

        test("a registered custom resolves by its word, snapshotting its refs", () => {
            const application = catalog.resolve("android", RequestedApplication.create({ name: "com.mycorp.app" }));

            expect(application.versionAlias).toBe("7.1-rc2");
            expect(application.source.isCustom()).toBe(true);
            expect(application.source.appRef).toBe("builds/app-7.1.apk");
            expect(application.source.webdriverRef).toBe("builds/driver-7.1");
        });

        test("refuses a word nothing on the platform answers to", () => {
            expect(() => catalog.resolve("android", RequestedApplication.create({ name: "firefox" })))
                .toThrow(ApplicationNotInCatalogError);
        });

        test("refuses an ask no build answers to", () => {
            expect(() => catalog.resolve("android", RequestedApplication.create({ name: "chrome", version: "150" })))
                .toThrow(ApplicationNotInCatalogError);
        });
    });

    test("ownAnswers covers the project's own words per platform", () => {
        expect(catalog.ownAnswers("android", "com.mycorp.app")).toBe(true);
        expect(catalog.ownAnswers("ubuntu", "com.mycorp.app")).toBe(false);
        expect(catalog.ownAnswers("ubuntu", "chrome")).toBe(true);
    });
});
