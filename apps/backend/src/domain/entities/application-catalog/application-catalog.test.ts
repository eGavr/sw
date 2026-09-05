import { RequestedApplication } from "../environment/application/requested-application";
import { Platform } from "../environment/platform/platform";

import { ApplicationCatalog } from "./application-catalog";
import { ApplicationNotInCatalogError } from "./error/application-not-in-catalog-error";
import { UnsupportedPlatformError } from "./error/unsupported-platform-error";

describe("ApplicationCatalog", () => {
    const catalog = ApplicationCatalog.fromObject({
        platforms: [
            { name: "ubuntu", versions: ["24.04"] },
            { name: "android", versions: ["14", "34"] },
        ],
        applications: [
            {
                platform: "ubuntu",
                name: "com.google.chrome",
                aliases: ["chrome"],
                version: "152.0.7977.82",
                artifacts: { app: "https://example.test/chrome.zip", webdriver: "https://example.test/driver.zip" },
            },
            {
                platform: "ubuntu",
                name: "com.google.chrome",
                aliases: ["chrome"],
                version: "151.0.7890.10",
                artifacts: { app: "https://example.test/chrome-151.zip" },
            },
            { platform: "android", name: "com.android.settings", aliases: ["settings"], version: "34" },
        ],
    });

    describe("ensurePlatformSupported", () => {
        test("admits a catalog platform line", () => {
            expect(() => catalog.ensurePlatformSupported(
                Platform.fromObject({ name: "ubuntu", version: "24.04" }),
            )).not.toThrow();
        });

        test("refuses an unknown version, naming the supported ones", () => {
            expect(() => catalog.ensurePlatformSupported(Platform.fromObject({ name: "ubuntu", version: "22.04" })))
                .toThrow(UnsupportedPlatformError);
            expect(() => catalog.ensurePlatformSupported(Platform.fromObject({ name: "ubuntu", version: "22.04" })))
                .toThrow(/24\.04/);
        });

        test("refuses a platform with no lines at all", () => {
            expect(() => catalog.ensurePlatformSupported(Platform.fromObject({ name: "ios", version: "18" })))
                .toThrow(UnsupportedPlatformError);
        });
    });

    describe("resolveProvided (create-environment: loose ask → concrete application)", () => {
        test("resolves an alias with no version to the canonical name at the newest full version", () => {
            const application = catalog.resolveProvided("ubuntu", RequestedApplication.create({ name: "chrome" }));

            expect(application.name).toBe("com.google.chrome");
            expect(application.version).toBe("152.0.7977.82");
            expect(application.source.isCustom()).toBe(false);
        });

        test("resolves a version prefix to the newest full version it opens", () => {
            const application = catalog.resolveProvided(
                "ubuntu",
                RequestedApplication.create({ name: "chrome", version: "151" }),
            );

            expect(application.version).toBe("151.0.7890.10");
        });

        test("resolves the canonical name itself", () => {
            expect(catalog.resolveProvided("ubuntu", RequestedApplication.create({ name: "com.google.chrome" })).name)
                .toBe("com.google.chrome");
        });

        test("resolves a preinstalled entry (no artifacts)", () => {
            expect(catalog.resolveProvided("android", RequestedApplication.create({ name: "settings" })).version)
                .toBe("34");
        });

        test("refuses a name the platform's catalog does not offer", () => {
            expect(() => catalog.resolveProvided("android", RequestedApplication.create({ name: "chrome" })))
                .toThrow(ApplicationNotInCatalogError);
        });

        test("refuses a version prefix nothing opens", () => {
            expect(() => catalog.resolveProvided(
                "ubuntu",
                RequestedApplication.create({ name: "chrome", version: "150" }),
            )).toThrow(ApplicationNotInCatalogError);
        });
    });

    describe("expand (session ask → candidate names)", () => {
        test("an alias expands to itself plus every canonical id it names, across platforms", () => {
            const match = catalog.expand(RequestedApplication.create({ name: "chrome", version: "152" }));

            expect(match.names).toEqual(["chrome", "com.google.chrome"]);
            expect(match.versionPrefix).toBe("152");
        });

        test("a canonical id expands to itself once", () => {
            expect(catalog.expand(RequestedApplication.create({ name: "com.google.chrome" })).names)
                .toEqual(["com.google.chrome"]);
        });

        test("an unknown (custom) name passes through untouched", () => {
            expect(catalog.expand(RequestedApplication.create({ name: "com.mycorp.app" })).names)
                .toEqual(["com.mycorp.app"]);
        });
    });

    describe("wireName", () => {
        test("translates a canonical id to its wire vocabulary word", () => {
            expect(catalog.wireName("com.google.chrome")).toBe("chrome");
        });

        test("passes a custom name through as-is", () => {
            expect(catalog.wireName("com.mycorp.app")).toBe("com.mycorp.app");
        });
    });
});
