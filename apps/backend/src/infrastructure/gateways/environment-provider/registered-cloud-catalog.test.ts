import { Execution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

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

    test("yandex-cloud provisions android and linux containers, not the unproven emulator", () => {
        const provides = catalog.providesFor("yandex-cloud");

        expect(provides.some((s) => s.matches("android", Execution.Container))).toBe(true);
        expect(provides.some((s) => s.matches("linux", Execution.Container))).toBe(true);
        expect(provides.some((s) => s.matches("android", Execution.Emulator))).toBe(false);
    });

    test("the local cloud provisions a linux container", () => {
        expect(catalog.providesFor("local").some((s) => s.matches("linux", Execution.Container))).toBe(true);
    });

    test("an unknown type provides nothing", () => {
        expect(catalog.providesFor("unknown")).toHaveLength(0);
    });

    test("narrows the catalogue to the install's enabled types", () => {
        const localOnly = new RegisteredCloudCatalog(["local"]);

        expect(localOnly.types()).toEqual(["local"]);
        expect(localOnly.supports("local")).toBe(true);
        expect(localOnly.supports("yandex-cloud")).toBe(false);
        expect(localOnly.providesFor("yandex-cloud")).toHaveLength(0);
    });

    test("fails fast when an enabled type is not a known backend", () => {
        expect(() => new RegisteredCloudCatalog(["local", "sky-cloud"])).toThrow(InternalError);
    });
});
