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

describe("ApplicationVersion.matchesPrefix", () => {
    const version = (value: string): ApplicationVersion => new ApplicationVersion(value);

    test("matches itself and any version it opens segment-wise", () => {
        expect(version("140.0.7339.80").matchesPrefix("140")).toBe(true);
        expect(version("140.0.7339.80").matchesPrefix("140.0")).toBe(true);
        expect(version("140.0.7339.80").matchesPrefix("140.0.7339.80")).toBe(true);
        expect(version("140").matchesPrefix("140")).toBe(true);
    });

    test("never matches across a segment boundary", () => {
        expect(version("1400.1").matchesPrefix("140")).toBe(false);
        expect(version("14.0.1").matchesPrefix("140")).toBe(false);
        expect(version("140.0.7339.80").matchesPrefix("140.0.7")).toBe(false);
    });
});
