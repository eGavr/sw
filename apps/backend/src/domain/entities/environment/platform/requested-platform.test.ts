import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Platform } from "./platform";
import { PlatformName } from "./platform-name";
import { RequestedPlatform } from "./requested-platform";

describe("RequestedPlatform", () => {
    const ubuntu = Platform.fromObject({ name: "ubuntu", version: "24.04", deviceModel: "desktop" });
    const android = Platform.fromObject({ name: "android", version: "14.0.1", deviceModel: "pixel-7" });

    test("a concrete platform word admits exactly that platform", () => {
        const requested = RequestedPlatform.create({ name: "android" });

        expect(requested.names).toEqual([PlatformName.Android]);
        expect(requested.matches(android)).toBe(true);
        expect(requested.matches(ubuntu)).toBe(false);
    });

    test("the W3C family word linux opens onto every linux platform the install runs", () => {
        const requested = RequestedPlatform.create({ name: "linux" });

        expect(requested.names).toEqual([PlatformName.Ubuntu]);
        expect(requested.matches(ubuntu)).toBe(true);
        expect(requested.matches(android)).toBe(false);
    });

    test("nothing asked constrains nothing", () => {
        const requested = RequestedPlatform.any();

        expect(requested.names).toBeNull();
        expect(requested.matches(ubuntu)).toBe(true);
        expect(requested.matches(android)).toBe(true);
        expect(requested.describe()).toBe("");
    });

    test("a version ask matches by leading segments", () => {
        expect(RequestedPlatform.create({ version: "14" }).matches(android)).toBe(true);
        expect(RequestedPlatform.create({ version: "14.0" }).matches(android)).toBe(true);
        expect(RequestedPlatform.create({ version: "13" }).matches(android)).toBe(false);
        expect(RequestedPlatform.create({ version: "1" }).matches(android)).toBe(false);
    });

    test("a device kind is folded to its canonical id and matched exactly", () => {
        expect(RequestedPlatform.create({ deviceModel: "Pixel 7" }).deviceModel).toBe("pixel-7");
        expect(RequestedPlatform.create({ deviceModel: "pixel_7" }).matches(android)).toBe(true);
        expect(RequestedPlatform.create({ deviceModel: "pixel-3a" }).matches(android)).toBe(false);
    });

    test("the parts combine, each independently", () => {
        const requested = RequestedPlatform.create({ name: "android", version: "14", deviceModel: "pixel-7" });

        expect(requested.matches(android)).toBe(true);
        expect(RequestedPlatform.create({ name: "android", deviceModel: "pixel-3a" }).matches(android)).toBe(false);
    });

    test("describes the ask as phrased for refusal messages", () => {
        expect(RequestedPlatform.create({ name: "linux" }).describe()).toBe("linux");
        expect(RequestedPlatform.create({ name: "android", version: "14", deviceModel: "Pixel 7" }).describe())
            .toBe("android 14 pixel-7");
    });

    test("rejects a platform word that is neither a platform nor a family", () => {
        expect(() => RequestedPlatform.create({ name: "windows" })).toThrow(InvalidArgumentError);
        expect(() => RequestedPlatform.create({ name: "windows" })).toThrow(/linux/);
    });
});
