import { ApplicationData } from "../../../../domain/entities/environment/application/application";

import { resolveDockerProvisioning } from "./docker-environment-config";

describe("resolveDockerProvisioning", () => {
    const ubuntu = { name: "ubuntu", version: "24.04", deviceModel: "desktop" };
    const chrome: ApplicationData = {
        nameAlias: "chrome",
        versionAlias: "152",
        source: { type: "provided", appRef: "https://store/chrome.zip", webdriverRef: "https://store/driver.zip" },
    };

    test("picks the base image of the platform version and lists what to deliver", () => {
        expect(resolveDockerProvisioning(ubuntu, [chrome], {})).toEqual({
            image: "sw-linux-base:24.04",
            env: { SW_APPS: "chrome~1", SW_DETECTED_APPS_FILE: "/tmp/sw-detected.json" },
        });
    });

    test("substitutes the {version} template of a configured base image", () => {
        expect(resolveDockerProvisioning(ubuntu, [chrome], { baseImage: "registry/linux:{version}" }).image)
            .toBe("registry/linux:24.04");
    });

    test("leaves preinstalled applications out of the delivery list, flags the webdriver per build", () => {
        const preinstalled: ApplicationData = { nameAlias: "settings", versionAlias: "1", source: { type: "provided" } };
        const noDriver: ApplicationData = {
            nameAlias: "myapp", versionAlias: "1", source: { type: "custom", appRef: "builds/app.zip" },
        };

        expect(resolveDockerProvisioning(ubuntu, [preinstalled, chrome, noDriver], {}).env.SW_APPS)
            .toBe("chrome~1,myapp~0");
    });
});
