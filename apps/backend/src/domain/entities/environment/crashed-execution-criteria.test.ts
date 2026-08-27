import { CrashedExecutionCriteria } from "./crashed-execution-criteria";
import { EnvironmentState } from "./environment-state";

describe("CrashedExecutionCriteria", () => {
    test("forms a freshness cutoff for the executing state", () => {
        const now = new Date(10_000);

        const predicates = CrashedExecutionCriteria.from(now, 6_000).toPredicates();

        expect(predicates).toEqual([
            { state: EnvironmentState.Executing, cutoff: new Date(4_000) },
        ]);
    });
});
