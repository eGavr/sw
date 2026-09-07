import { ApplicationData } from "../../../domain/entities/environment/application/application";

import { linuxNodeProvisioning } from "./linux-node";

describe("linuxNodeProvisioning", () => {
    const ubuntu = { name: "ubuntu", version: "24.04", deviceModel: "desktop" };
    const chrome: ApplicationData = {
        nameAlias: "chrome",
        versionAlias: "152",
        source: { type: "provided", appRef: "https://store/chrome.zip", webdriverRef: "https://store/driver.zip" },
    };
    const params = {
        platform: ubuntu,
        applications: [chrome],
        baseImage: "sw-linux-base:{version}",
        sessionTimeoutSeconds: 300,
        screen: { width: 1360, height: 1020 },
    };

    test("picks the base image of the platform version and hands the node its parameters", () => {
        expect(linuxNodeProvisioning(params)).toEqual({
            image: "sw-linux-base:24.04",
            env: {
                SW_APPS: "chrome~1~1",
                SW_DETECTED_APPS_FILE: "/tmp/sw-detected.json",
                SW_SESSION_IDLE_TIMEOUT_SECONDS: "300",
                SW_SCREEN_WIDTH: "1360",
                SW_SCREEN_HEIGHT: "1020",
            },
        });
    });

    test("substitutes the {version} template of a registry image", () => {
        expect(linuxNodeProvisioning({ ...params, baseImage: "cr.example/linux:{version}" }).image)
            .toBe("cr.example/linux:24.04");
    });

    test("lists every application with its artifact and webdriver flags — a bare preinstall included", () => {
        const preinstalled: ApplicationData = { nameAlias: "settings", versionAlias: "1", source: { type: "provided" } };
        const driven: ApplicationData = {
            nameAlias: "chrome", versionAlias: "1", source: { type: "provided", webdriverRef: "https://store/driver.zip" },
        };
        const noDriver: ApplicationData = {
            nameAlias: "myapp", versionAlias: "1", source: { type: "custom", appRef: "builds/app.zip" },
        };

        expect(linuxNodeProvisioning({ ...params, applications: [preinstalled, driven, chrome, noDriver] }).env.SW_APPS)
            .toBe("settings~0~0,chrome~0~1,chrome~1~1,myapp~1~0");
    });
});
