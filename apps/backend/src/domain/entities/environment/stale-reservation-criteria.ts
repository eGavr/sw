import { EnvironmentOccupancy } from "./environment-occupancy";

export type StaleReservationPredicate = {
    readonly occupancy: EnvironmentOccupancy;
    readonly confirmationCutoff: Date;
};

// Which reservations the sweep may take back: still `reserved`, but the reserving wd has stopped
// heartbeating past the staleness window — it died mid-create (a live one beats every few seconds
// however long the node takes). The window is a domain decision expressed as a ready predicate; the
// data source only translates it into a query.
export class StaleReservationCriteria {
    static from(now: Date, stalenessMs: number): StaleReservationCriteria {
        return new StaleReservationCriteria({
            occupancy: EnvironmentOccupancy.Reserved,
            confirmationCutoff: new Date(now.getTime() - stalenessMs),
        });
    }

    private constructor(private readonly predicate: StaleReservationPredicate) {}

    toPredicate(): StaleReservationPredicate {
        return this.predicate;
    }
}
