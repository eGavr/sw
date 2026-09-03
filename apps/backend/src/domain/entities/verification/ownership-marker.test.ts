import { InvalidArgumentError } from "../error/invalid-argument-error";

import { OwnershipMarker } from "./ownership-marker";

describe("OwnershipMarker", () => {
    const projectId = "94a41349-8414-4e04-b010-269aa9ae8664";

    test("derives a per-project, medium-agnostic value", () => {
        expect(OwnershipMarker.forProject(projectId).value()).toBe(`sw-verify-${projectId}`);
    });

    test("the value is usable as a YC label key (letter start, ≤63 chars, allowed charset) and an object key", () => {
        const value = OwnershipMarker.forProject(projectId).value();

        expect(value).toMatch(/^[a-z][-_0-9a-z]*$/);
        expect(value.length).toBeLessThanOrEqual(63);
    });

    test("is keyed by project — two projects yield distinct markers", () => {
        const mine = OwnershipMarker.forProject(projectId).value();
        const other = OwnershipMarker.forProject("00000000-0000-0000-0000-000000000000").value();

        expect(mine).not.toBe(other);
    });

    test("rejects an empty project id", () => {
        expect(() => OwnershipMarker.forProject("")).toThrow(InvalidArgumentError);
    });
});
