import { RequestedApplication } from "./requested-application";

describe("RequestedApplication", () => {
    test("a concrete version is not latest and is reported", () => {
        const requested = RequestedApplication.create({ name: "chrome", version: "141" });

        expect(requested.name).toBe("chrome");
        expect(requested.isLatest()).toBe(false);
        expect(requested.version()).toBe("141");
    });

    test("the reserved 'latest' version means latest (case-insensitive)", () => {
        const requested = RequestedApplication.create({ name: "chrome", version: "LATEST" });

        expect(requested.isLatest()).toBe(true);
        expect(requested.version()).toBeNull();
    });

    test("an omitted version means latest", () => {
        const requested = RequestedApplication.create({ name: "chrome" });

        expect(requested.isLatest()).toBe(true);
        expect(requested.version()).toBeNull();
    });
});
