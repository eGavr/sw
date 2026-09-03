import { InvalidArgumentError } from "../error/invalid-argument-error";

import { SlotPorts } from "./slot-ports";

describe("SlotPorts", () => {
    test("derives the slot's port layout from its index", () => {
        const first = SlotPorts.forIndex(0);
        expect(first.wd).toBe(4600);
        expect(first.appium).toBe(4700);
        expect(first.console).toBe(5554);

        const fourth = SlotPorts.forIndex(3);
        expect(fourth.wd).toBe(4603);
        expect(fourth.appium).toBe(4703);
        expect(fourth.console).toBe(5560);
    });

    test("keeps every console port even, as adb discovery requires", () => {
        for (let index = 0; index < SlotPorts.maxSlots; index += 1) {
            expect(SlotPorts.forIndex(index).console % 2).toBe(0);
        }
    });

    test("rejects indexes outside the adb-imposed slot range", () => {
        expect(() => SlotPorts.forIndex(-1)).toThrow(InvalidArgumentError);
        expect(() => SlotPorts.forIndex(SlotPorts.maxSlots)).toThrow(InvalidArgumentError);
        expect(() => SlotPorts.forIndex(1.5)).toThrow(InvalidArgumentError);
    });
});
