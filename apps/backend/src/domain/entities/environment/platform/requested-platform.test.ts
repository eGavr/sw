import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Platform } from "./platform";
import { PlatformName } from "./platform-name";
import { RequestedPlatform } from "./requested-platform";

describe("RequestedPlatform", () => {
    const ubuntu = Platform.fromObject({ name: "ubuntu", version: "24.04" });
    const android = Platform.fromObject({ name: "android", version: "14" });

    test("a concrete platform word admits exactly that platform", () => {
        const requested = RequestedPlatform.create("android");

        expect(requested.names).toEqual([PlatformName.Android]);
        expect(requested.matches(android)).toBe(true);
        expect(requested.matches(ubuntu)).toBe(false);
    });

    test("the W3C family word linux opens onto every linux platform the install runs", () => {
        const requested = RequestedPlatform.create("linux");

        expect(requested.names).toEqual([PlatformName.Ubuntu]);
        expect(requested.matches(ubuntu)).toBe(true);
        expect(requested.matches(android)).toBe(false);
    });

    test("keeps the asked word for refusal messages", () => {
        expect(RequestedPlatform.create("linux").word).toBe("linux");
    });

    test("rejects a word that is neither a platform nor a family", () => {
        expect(() => RequestedPlatform.create("windows")).toThrow(InvalidArgumentError);
        expect(() => RequestedPlatform.create("windows")).toThrow(/linux/);
    });
});
