import { InvalidArgumentError } from "../error/invalid-argument-error";

import { OwnershipMarker } from "./ownership-marker";

describe("OwnershipMarker", () => {
    const projectId = "94a41349-8414-4e04-b010-269aa9ae8664";

    test("derives a per-project label key and object key", () => {
        const marker = OwnershipMarker.forProject(projectId);

        expect(marker.labelKey()).toBe(`sw-verify-${projectId}`);
        expect(marker.objectKey()).toBe(`sw-verify/${projectId}`);
    });

    test("the label key is a valid YC label (letter start, ≤63 chars, allowed charset)", () => {
        const key = OwnershipMarker.forProject(projectId).labelKey();

        expect(key).toMatch(/^[a-z][-_0-9a-z]*$/);
        expect(key.length).toBeLessThanOrEqual(63);
    });

    test("detects its own marker among a resource's labels, ignoring another project's", () => {
        const marker = OwnershipMarker.forProject(projectId);
        const other = OwnershipMarker.forProject("00000000-0000-0000-0000-000000000000");

        expect(marker.presentIn({ [marker.labelKey()]: "" })).toBe(true);
        expect(marker.presentIn({ [other.labelKey()]: "", unrelated: "x" })).toBe(false);
        expect(marker.presentIn({})).toBe(false);
    });

    test("rejects an empty project id", () => {
        expect(() => OwnershipMarker.forProject("")).toThrow(InvalidArgumentError);
    });
});
