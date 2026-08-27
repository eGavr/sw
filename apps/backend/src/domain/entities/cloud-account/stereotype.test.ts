import { Execution } from "../environment/execution";

import { Stereotype } from "./stereotype";

describe("Stereotype", () => {
    const androidContainer = new Stereotype("android", Execution.Container);

    test("matches only the same platform and execution", () => {
        expect(androidContainer.matches("android", Execution.Container)).toBe(true);
        expect(androidContainer.matches("android", Execution.Emulator)).toBe(false);
        expect(androidContainer.matches("linux", Execution.Container)).toBe(false);
    });

    test("equals another with the same pair", () => {
        expect(androidContainer.equals(new Stereotype("android", Execution.Container))).toBe(true);
        expect(androidContainer.equals(new Stereotype("android", Execution.Emulator))).toBe(false);
    });

    test("round-trips through toObject/fromObject", () => {
        const restored = Stereotype.fromObject(androidContainer.toObject());

        expect(restored.equals(androidContainer)).toBe(true);
    });
});
