import { RequestedApplication } from "../environment/application/requested-application";
import { ProjectApplication } from "../project-application/project-application";

import { ApplicationCatalog } from "./application-catalog";
import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";

describe("ApplicationCatalog", () => {
    const provided = (
        platformName: string,
        name: string,
        aliases: Array<string>,
        versions: Array<{ version: string; appRef?: string; webdriverRef?: string }>,
    ): ProjectApplication => {
        const application = ProjectApplication.create({ projectId: "catalog-id", platformName, name, aliases });

        versions.forEach((version) => application.addVersion(version));

        return application;
    };

    const custom = (
        platformName: string,
        name: string,
        versions: Array<{ version: string; appRef: string; webdriverRef?: string }>,
    ): ProjectApplication => {
        const application = ProjectApplication.create({ projectId: "project-id", platformName, name });

        versions.forEach((version) => application.addVersion(version));

        return application;
    };

    const catalog = ApplicationCatalog.of({
        catalog: [
            // A linux app's name IS the word (nothing measurable to canonise); reverse-DNS canonicals
            // with wire aliases live where the platform measures them — android.
            provided("ubuntu", "chrome", [], [
                { version: "152.0.7977.82", appRef: "ref://chrome-152", webdriverRef: "ref://driver-152" },
                { version: "151.0.7890.10", appRef: "ref://chrome-151" },
            ]),
            provided("android", "com.android.chrome", ["chrome"], [
                { version: "152.0.7977.80", appRef: "ref://chrome-apk-152" },
            ]),
            provided("android", "com.android.settings", ["settings"], [{ version: "14" }]),
        ],
        own: [
            custom("android", "com.mycorp.app", [
                { version: "7.1.0", appRef: "builds/app-7.1.0.apk", webdriverRef: "builds/driver-7.1.0" },
            ]),
        ],
    });

    describe("resolve (create-environment: loose word → concrete build)", () => {
        test("a word with no version resolves to the newest full version", () => {
            const application = catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome" }));

            expect(application.name).toBe("chrome");
            expect(application.version).toBe("152.0.7977.82");
            expect(application.source.isCustom()).toBe(false);
            expect(application.source.appRef).toBe("ref://chrome-152");
            expect(application.source.webdriverRef).toBe("ref://driver-152");
        });

        test("a version prefix resolves to the newest full version it opens", () => {
            expect(catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome", version: "151" })).version)
                .toBe("151.0.7890.10");
        });

        test("an alias resolves to the canonical name on its platform", () => {
            expect(catalog.resolve("android", RequestedApplication.create({ name: "chrome" })).name)
                .toBe("com.android.chrome");
        });

        test("a preinstalled build resolves with nothing to deliver", () => {
            const application = catalog.resolve("android", RequestedApplication.create({ name: "settings" }));

            expect(application.version).toBe("14");
            expect(application.source.appRef).toBeNull();
        });

        test("a registered custom resolves by its canonical name, snapshotting its refs", () => {
            const application = catalog.resolve("android", RequestedApplication.create({ name: "com.mycorp.app" }));

            expect(application.source.isCustom()).toBe(true);
            expect(application.source.appRef).toBe("builds/app-7.1.0.apk");
            expect(application.source.webdriverRef).toBe("builds/driver-7.1.0");
        });

        test("refuses a word nothing on the platform answers to", () => {
            expect(() => catalog.resolve("android", RequestedApplication.create({ name: "firefox" })))
                .toThrow(ApplicationNotInCatalogError);
        });

        test("refuses a version prefix nothing opens", () => {
            expect(() => catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome", version: "150" })))
                .toThrow(ApplicationNotInCatalogError);
        });
    });

    describe("expand (session ask → candidate names)", () => {
        test("a word expands to itself plus every canonical it names or aliases, across platforms", () => {
            const match = catalog.expand(RequestedApplication.create({ name: "chrome", version: "152" }));

            expect(match.names).toEqual(["chrome", "com.android.chrome"]);
            expect(match.versionPrefix).toBe("152");
        });

        test("a custom name passes through untouched — customs have no aliases by the docker rule", () => {
            expect(catalog.expand(RequestedApplication.create({ name: "com.mycorp.app" })).names)
                .toEqual(["com.mycorp.app"]);
        });
    });

    describe("the docker rule's helpers", () => {
        test("catalogReserves covers canonical names and aliases per platform", () => {
            expect(catalog.catalogReserves("ubuntu", "chrome")).toBe(true);
            expect(catalog.catalogReserves("android", "chrome")).toBe(true);
            expect(catalog.catalogReserves("android", "firefox")).toBe(false);
        });

        test("wireName translates a catalog canonical to its wire word, passing customs through", () => {
            expect(catalog.wireName("com.android.chrome")).toBe("chrome");
            expect(catalog.wireName("com.mycorp.app")).toBe("com.mycorp.app");
        });
    });
});
