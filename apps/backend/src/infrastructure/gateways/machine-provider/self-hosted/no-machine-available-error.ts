import { ResourceExhaustedError } from "../../../../domain/entities/error/resource-exhausted-error";

export class NoMachineAvailableError extends ResourceExhaustedError {
    constructor(platformName: string, execution: string) {
        super(`self-hosted: no free machine provides ${platformName}/${execution} right now`);
    }
}
