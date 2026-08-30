import { EnvironmentOccupancy } from "./environment-occupancy";
import { StaleReservationCriteria } from "./stale-reservation-criteria";

describe("StaleReservationCriteria", () => {
    test("targets reservations whose reservation heartbeat lapsed past the staleness window", () => {
        const now = new Date(1_000_000);

        const predicate = StaleReservationCriteria.from(now, 10_000).toPredicate();

        expect(predicate).toEqual({
            occupancy: EnvironmentOccupancy.Reserved,
            confirmationCutoff: new Date(990_000),
        });
    });
});
