import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { Application } from "./application";
import { ApplicationKind } from "./application-kind";
import { ApplicationList } from "./application-list";

describe("Application", () => {
    describe(".create", () => {
        test("should throw when name contains invalid symbols", () => {
            const create = (): Application =>
                Application.create({ name: "Chrome!", version: "100", kind: ApplicationKind.Browser });

            expect(create).toThrow(InvalidArgumentError);
        });
    });

    describe("#equals", () => {
        test("should treat same name, version and kind as equal", () => {
            const chrome = Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser });
            const sameChrome = Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser });

            expect(chrome.equals(sameChrome)).toBe(true);
        });
    });
});

describe("ApplicationList", () => {
    describe("#has", () => {
        const chrome100 = Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser });
        const list = ApplicationList.create({ applications: [chrome100] });

        test("should find an application available in the list", () => {
            const requested = Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser });

            expect(list.has(requested)).toBe(true);
        });

        test("should not find a different version", () => {
            const requested = Application.create({ name: "chrome", version: "101", kind: ApplicationKind.Browser });

            expect(list.has(requested)).toBe(false);
        });
    });
});
