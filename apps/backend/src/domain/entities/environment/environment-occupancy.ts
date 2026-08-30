// Occupancy is orthogonal to the lifecycle state: it says who holds the environment right now, not
// where it is on its way from enqueued to deleted. `reserved` is the pessimistic-allocation window —
// a wd instance claimed the environment and is creating a session on its node; nobody else may take it.
export enum EnvironmentOccupancy {
    Free = "free",
    Reserved = "reserved",
    Busy = "busy",
}

export function toEnvironmentOccupancy(value: string): EnvironmentOccupancy | null {
    return Object.values(EnvironmentOccupancy).find((candidate) => candidate === value) ?? null;
}
