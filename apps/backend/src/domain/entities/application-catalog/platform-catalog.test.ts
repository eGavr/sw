import { Platform } from "../environment/platform/platform";

import { DeviceModelRequiredError } from "./error/device-model-required-error";
import { UnsupportedDeviceModelError } from "./error/unsupported-device-model-error";
import { UnsupportedPlatformError } from "./error/unsupported-platform-error";
import { PlatformCatalog } from "./platform-catalog";

describe("PlatformCatalog", () => {
    const catalog = PlatformCatalog.fromObject({
        platforms: [
            { name: "ubuntu", versions: ["24.04"], devices: [{ id: "desktop", displayName: "Desktop" }] },
            {
                name: "android",
                versions: ["13", "14"],
                devices: [{ id: "pixel-7", displayName: "Pixel 7" }, { id: "pixel-3a", displayName: "Pixel 3a" }],
            },
        ],
    });

    describe("resolveDeviceModel", () => {
        test("a line with a single device kind implies it", () => {
            expect(catalog.resolveDeviceModel("ubuntu", undefined).getValue()).toBe("desktop");
        });

        test("a line with several device kinds makes the caller choose", () => {
            expect(() => catalog.resolveDeviceModel("android", undefined)).toThrow(DeviceModelRequiredError);
            expect(() => catalog.resolveDeviceModel("android", undefined)).toThrow(/pixel-7, pixel-3a/);
        });

        test("folds the typed word and checks it against the line", () => {
            expect(catalog.resolveDeviceModel("android", "Pixel 7").getValue()).toBe("pixel-7");
            expect(() => catalog.resolveDeviceModel("android", "galaxy-s23")).toThrow(UnsupportedDeviceModelError);
            expect(() => catalog.resolveDeviceModel("ubuntu", "pixel-7")).toThrow(UnsupportedDeviceModelError);
        });
    });

    describe("ensurePlatformSupported", () => {
        test("admits a version and device kind the line offers", () => {
            expect(() => catalog.ensurePlatformSupported(
                Platform.fromObject({ name: "android", version: "14", deviceModel: "pixel-3a" }),
            )).not.toThrow();
        });

        test("rejects a version outside the line", () => {
            expect(() => catalog.ensurePlatformSupported(
                Platform.fromObject({ name: "android", version: "12", deviceModel: "pixel-7" }),
            )).toThrow(UnsupportedPlatformError);
        });

        test("rejects a device kind the line does not offer", () => {
            expect(() => catalog.ensurePlatformSupported(
                Platform.fromObject({ name: "android", version: "14", deviceModel: "desktop" }),
            )).toThrow(UnsupportedDeviceModelError);
        });

        test("rejects a platform outside the catalog", () => {
            expect(() => catalog.ensurePlatformSupported(
                Platform.fromObject({ name: "ios", version: "17", deviceModel: "iphone-15" }),
            )).toThrow(UnsupportedPlatformError);
        });
    });

    test("lines carry their device kinds", () => {
        expect(catalog.line("android")?.devices).toEqual([
            { id: "pixel-7", displayName: "Pixel 7" },
            { id: "pixel-3a", displayName: "Pixel 3a" },
        ]);
        expect(catalog.lines().map((line) => line.name)).toEqual(["ubuntu", "android"]);
    });
});
