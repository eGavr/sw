import { Execution } from "../../../domain/entities/environment/execution";

import { RegisteredCloudCatalog } from "./registered-cloud-catalog";

describe("RegisteredCloudCatalog", () => {
    const catalog = new RegisteredCloudCatalog();

    test("supports the registered cloud types only", () => {
        expect(catalog.supports("yandex-cloud")).toBe(true);
        expect(catalog.supports("local")).toBe(true);
        expect(catalog.supports("unknown")).toBe(false);
        // A prototype key must not be mistaken for a registered type.
        expect(catalog.supports("constructor")).toBe(false);
    });

    test("yandex-cloud provisions only the live-proven android container substrate", () => {
        const provides = catalog.providesFor("yandex-cloud");

        expect(provides.some((s) => s.matches("android", Execution.Container))).toBe(true);
        expect(provides.some((s) => s.matches("android", Execution.Emulator))).toBe(false);
        expect(provides.some((s) => s.matches("linux", Execution.Container))).toBe(false);
    });

    test("the local cloud provisions a linux container", () => {
        expect(catalog.providesFor("local").some((s) => s.matches("linux", Execution.Container))).toBe(true);
    });

    test("an unknown type provides nothing", () => {
        expect(catalog.providesFor("unknown")).toHaveLength(0);
    });
});
