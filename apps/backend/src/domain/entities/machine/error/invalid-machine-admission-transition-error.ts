import { FailedPreconditionError } from "../../error/failed-precondition-error";

export class InvalidMachineAdmissionTransitionError extends FailedPreconditionError {
    constructor(machineId: string, from: string, to: string) {
        super(`machine: ${machineId}: cannot go from ${from} to ${to}`);
    }
}
