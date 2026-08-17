import { InvalidArgumentError } from "../../error/invalid-argument-error";
import { NonConcreteApplicationVersionError } from "../error/non-concrete-application-version-error";

import { Application } from "./application";
import { ApplicationList } from "./application-list";

describe("Application", () => {
    describe(".create", () => {
        test("should throw when name contains invalid symbols", () => {
            const create = (): Application => Application.create({ name: "Chrome!", version: "100" });

            expect(create).toThrow(InvalidArgumentError);
        });

        test("should reject a non-concrete version (an installed application needs an exact version)", () => {
            const create = (): Application => Application.create({ name: "chrome", version: "latest" });

            expect(create).toThrow(NonConcreteApplicationVersionError);
        });

        test("should reject the non-concrete version regardless of case", () => {
            const create = (): Application => Application.create({ name: "chrome", version: "LATEST" });

            expect(create).toThrow(NonConcreteApplicationVersionError);
        });
    });

    describe(".fromObject", () => {
        test("should tolerate the reserved version (a request/stored value may carry it)", () => {
            const reconstitute = (): Application => Application.fromObject({ name: "chrome", version: "latest" });

            expect(reconstitute).not.toThrow();
        });
    });

    describe("#equals", () => {
        test("should treat same name and version as equal", () => {
            const chrome = Application.create({ name: "chrome", version: "100" });
            const sameChrome = Application.create({ name: "chrome", version: "100" });

            expect(chrome.equals(sameChrome)).toBe(true);
        });
    });
});

describe("ApplicationList", () => {
    describe("#has", () => {
        const chrome100 = Application.create({ name: "chrome", version: "100" });
        const list = ApplicationList.create({ applications: [chrome100] });

        test("should find an application available in the list", () => {
            const requested = Application.create({ name: "chrome", version: "100" });

            expect(list.has(requested)).toBe(true);
        });

        test("should not find a different version", () => {
            const requested = Application.create({ name: "chrome", version: "101" });

            expect(list.has(requested)).toBe(false);
        });
    });
});
