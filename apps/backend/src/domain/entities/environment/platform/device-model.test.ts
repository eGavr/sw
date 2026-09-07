import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { DeviceModel } from "./device-model";

describe("DeviceModel", () => {
    test("folds a human-typed model to its canonical id", () => {
        expect(DeviceModel.fromWord("Pixel 7").getValue()).toBe("pixel-7");
        expect(DeviceModel.fromWord("pixel_7").getValue()).toBe("pixel-7");
        expect(DeviceModel.fromWord("  iPhone 15 Pro ").getValue()).toBe("iphone-15-pro");
        expect(DeviceModel.fromWord("desktop").getValue()).toBe("desktop");
    });

    test("a canonical id is lower-case hyphenated words", () => {
        expect(() => new DeviceModel("Pixel 7")).toThrow(InvalidArgumentError);
        expect(() => new DeviceModel("pixel--7")).toThrow(InvalidArgumentError);
        expect(() => new DeviceModel("")).toThrow(InvalidArgumentError);
    });

    test("compares by id", () => {
        expect(DeviceModel.fromWord("Pixel 7").equals(new DeviceModel("pixel-7"))).toBe(true);
        expect(DeviceModel.fromWord("Pixel 7").equals(new DeviceModel("pixel-3a"))).toBe(false);
    });
});
