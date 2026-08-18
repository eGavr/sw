import { ApplicationVersion } from "./application-version";

describe("ApplicationVersion", () => {
    const version = (value: string): ApplicationVersion => new ApplicationVersion(value);

    test("orders a higher major version as newer", () => {
        expect(version("141").compareTo(version("139"))).toBeGreaterThan(0);
        expect(version("139").compareTo(version("141"))).toBeLessThan(0);
    });

    test("compares numeric segments as numbers, not strings", () => {
        expect(version("10").compareTo(version("9"))).toBeGreaterThan(0);
        expect(version("1.10").compareTo(version("1.9"))).toBeGreaterThan(0);
    });

    test("treats a missing trailing segment as zero", () => {
        expect(version("1.2").compareTo(version("1.2.0"))).toBe(0);
        expect(version("1.2").compareTo(version("1.2.1"))).toBeLessThan(0);
    });

    test("orders equal versions as equal", () => {
        expect(version("141.0.7390.54").compareTo(version("141.0.7390.54"))).toBe(0);
    });

    test("orders realistic chrome build versions", () => {
        expect(version("141.0.7390.54").compareTo(version("141.0.7390.9"))).toBeGreaterThan(0);
    });
});
