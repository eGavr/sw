import { ConflictError } from "../../error/conflict-error";
import { EnvironmentOccupancy } from "../environment-occupancy";

// An occupancy move that the current holder forbids: reserving a taken environment (the lost
// allocation race), occupying or beating a reservation that is no longer held, releasing a busy one.
export class InvalidEnvironmentOccupancyTransitionError extends ConflictError {
    constructor(from: EnvironmentOccupancy, to: EnvironmentOccupancy) {
        super(`environment: cannot move occupancy from ${from} to ${to}`);
    }
}
