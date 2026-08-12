import { EnvironmentState } from "./environment-state";
import { GarbageCollectionCriteria } from "./garbage-collection-criteria";

describe("GarbageCollectionCriteria", () => {
    test("collects deleting by heartbeat freshness and failed by age since update", () => {
        const now = new Date(1_000_000);

        const predicates = GarbageCollectionCriteria.from(now, { freshnessMs: 6_000, failedTtlMs: 100_000 }).toPredicates();

        expect(predicates).toEqual([
            {
                state: EnvironmentState.Deleting,
                cutoff: new Date(994_000),
                timestamp: "lastHeartbeatAt",
                collectWhenNull: true,
            },
            {
                state: EnvironmentState.Failed,
                cutoff: new Date(900_000),
                timestamp: "updatedAt",
                collectWhenNull: false,
            },
        ]);
    });
});
