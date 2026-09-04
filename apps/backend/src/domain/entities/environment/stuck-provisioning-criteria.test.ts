import { EnvironmentState } from "./environment-state";
import { StuckProvisioningCriteria } from "./stuck-provisioning-criteria";

describe("StuckProvisioningCriteria", () => {
    test("forms a per-phase cutoff for the starting and preparing states", () => {
        const now = new Date(10_000);

        const predicates = StuckProvisioningCriteria.from(now, { startingMs: 1_000, preparingMs: 5_000 }).toPredicates();

        expect(predicates).toEqual([
            { state: EnvironmentState.Starting, cutoff: new Date(9_000) },
            { state: EnvironmentState.Preparing, cutoff: new Date(5_000) },
        ]);
    });

    test("a kind with its own preparing lease is carved out of the default predicate", () => {
        const now = new Date(10_000_000);

        const predicates = StuckProvisioningCriteria.from(
            now,
            { startingMs: 1_000, preparingMs: 5_000 },
            [{ kind: "baremetal", preparingMs: 2_000_000 }],
        ).toPredicates();

        expect(predicates).toEqual([
            { state: EnvironmentState.Starting, cutoff: new Date(9_999_000) },
            {
                state: EnvironmentState.Preparing,
                cutoff: new Date(9_995_000),
                excludeComputeKinds: ["baremetal"],
            },
            {
                state: EnvironmentState.Preparing,
                cutoff: new Date(8_000_000),
                computeKind: "baremetal",
            },
        ]);
    });
});
