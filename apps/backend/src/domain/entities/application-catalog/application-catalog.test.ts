import { RequestedApplication } from "../environment/application/requested-application";
import { ProjectApplication } from "../project-application/project-application";

import { ApplicationCatalog } from "./application-catalog";
import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";

describe("ApplicationCatalog", () => {
    const provided = (
        platformName: string,
        name: string,
        aliases: Array<string>,
        versions: Array<{ alias: string; appRef?: string; webdriverRef?: string }>,
    ): ProjectApplication => {
        const application = ProjectApplication.create({ projectId: "catalog-id", platformName, name, aliases });

        versions.forEach((version) => application.addVersion(version));

        return application;
    };

    const custom = (
        platformName: string,
        name: string,
        versions: Array<{ alias: string; appRef: string; webdriverRef?: string }>,
    ): ProjectApplication => {
        const application = ProjectApplication.create({ projectId: "project-id", platformName, name });

        versions.forEach((version) => application.addVersion(version));

        return application;
    };

    const catalog = ApplicationCatalog.of({
        catalog: [
            // A linux app's name IS the word (nothing detectable to canonise); reverse-DNS canonicals
            // with wire aliases live where the platform detects them — android.
            provided("ubuntu", "chrome", [], [
                { alias: "151", appRef: "ref://chrome-151" },
                { alias: "152", appRef: "ref://chrome-152", webdriverRef: "ref://driver-152" },
            ]),
            provided("android", "com.android.chrome", ["chrome"], [
                { alias: "152", appRef: "ref://chrome-apk-152" },
            ]),
            provided("android", "com.android.settings", ["settings"], [{ alias: "14" }]),
        ],
        own: [
            custom("android", "com.mycorp.app", [
                { alias: "7.1-rc2", appRef: "builds/app-7.1.apk", webdriverRef: "builds/driver-7.1" },
            ]),
        ],
    });

    describe("resolve (create-environment: loose word → concrete build)", () => {
        test("a word with no ask resolves to the last registered build", () => {
            const application = catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome" }));

            expect(application.nameAlias).toBe("chrome");
            expect(application.versionAlias).toBe("152");
            expect(application.source.isCustom()).toBe(false);
            expect(application.source.appRef).toBe("ref://chrome-152");
            expect(application.source.webdriverRef).toBe("ref://driver-152");
        });

        test("a version ask addresses a build by its alias", () => {
            expect(catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome", version: "151" }))
                .versionAlias).toBe("151");
        });

        test("an alias resolves to the canonical name on its platform", () => {
            expect(catalog.resolve("android", RequestedApplication.create({ name: "chrome" })).nameAlias)
                .toBe("com.android.chrome");
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
            expect(() => catalog.resolve("ubuntu", RequestedApplication.create({ name: "chrome", version: "150" })))
                .toThrow(ApplicationNotInCatalogError);
        });
    });

    describe("expand (session ask → candidate words)", () => {
        test("a word expands to itself plus every canonical it names or aliases, across platforms", () => {
            const match = catalog.expand(RequestedApplication.create({ name: "chrome", version: "152" }));

            expect(match.names).toEqual(["chrome", "com.android.chrome"]);
            expect(match.versionAsk).toBe("152");
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
