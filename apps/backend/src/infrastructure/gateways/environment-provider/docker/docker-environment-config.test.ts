import { ApplicationData } from "../../../../domain/entities/environment/application/application";

import { resolveDockerProvisioning } from "./docker-environment-config";

describe("resolveDockerProvisioning", () => {
    const chrome: ApplicationData = { name: "chrome", version: "124" };

    describe("prebuilt strategy", () => {
        test("falls back to the selenium image keyed by version", () => {
            expect(resolveDockerProvisioning(chrome, {})).toEqual({ image: "selenium/standalone-chrome:124.0" });
        });

        test("uses a fixed image tag as-is", () => {
            expect(resolveDockerProvisioning(chrome, { image: "seleniarm/standalone-chromium:latest" }))
                .toEqual({ image: "seleniarm/standalone-chromium:latest" });
        });

        test("substitutes the {version} template", () => {
            expect(resolveDockerProvisioning(chrome, { image: "registry/chrome:{version}" }))
                .toEqual({ image: "registry/chrome:124" });
        });
    });

    describe("install strategy", () => {
        test("uses the base image and passes the browser via env", () => {
            expect(resolveDockerProvisioning(chrome, { baseImage: "sw/browser-base:1" })).toEqual({
                image: "sw/browser-base:1",
                env: { SW_BROWSER_NAME: "chrome", SW_BROWSER_VERSION: "124" },
            });
        });

        test("takes precedence over a prebuilt image", () => {
            expect(resolveDockerProvisioning(chrome, { image: "selenium/x:1", baseImage: "sw/base:1" }).image)
                .toBe("sw/base:1");
        });
    });
});
