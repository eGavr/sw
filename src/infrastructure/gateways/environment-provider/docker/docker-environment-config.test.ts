import { ApplicationData } from "../../../../domain/entities/environment/application/application";

import { buildDockerEnvironmentConfig } from "./docker-environment-config";

describe("buildDockerEnvironmentConfig", () => {
    const chrome: ApplicationData = { name: "chrome", version: "124" };
    const base = {
        internalPort: 4444,
        sessionTimeoutSeconds: 300,
        advertiseHost: "127.0.0.1",
        internalUrl: "http://host.docker.internal:3002",
        internalSecret: "secret",
    };

    describe("prebuilt strategy", () => {
        test("falls back to the selenium image keyed by version", () => {
            const { resolve } = buildDockerEnvironmentConfig({ ...base });

            expect(resolve(chrome)).toEqual({ image: "selenium/standalone-chrome:124" });
        });

        test("uses a fixed image tag as-is", () => {
            const { resolve } = buildDockerEnvironmentConfig({ ...base, image: "seleniarm/standalone-chromium:latest" });

            expect(resolve(chrome)).toEqual({ image: "seleniarm/standalone-chromium:latest" });
        });

        test("substitutes the {version} template", () => {
            const { resolve } = buildDockerEnvironmentConfig({ ...base, image: "registry/chrome:{version}" });

            expect(resolve(chrome)).toEqual({ image: "registry/chrome:124" });
        });
    });

    describe("install strategy", () => {
        test("uses the base image and passes the browser via env", () => {
            const { resolve } = buildDockerEnvironmentConfig({ ...base, baseImage: "sw/browser-base:1" });

            expect(resolve(chrome)).toEqual({
                image: "sw/browser-base:1",
                env: { SW_BROWSER_NAME: "chrome", SW_BROWSER_VERSION: "124" },
            });
        });

        test("takes precedence over a prebuilt image", () => {
            const { resolve } = buildDockerEnvironmentConfig({ ...base, image: "selenium/x:1", baseImage: "sw/base:1" });

            expect(resolve(chrome).image).toBe("sw/base:1");
        });
    });
});
