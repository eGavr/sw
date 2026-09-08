import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class EmptyProvidesError extends InvalidArgumentError {
    constructor(machineId: string) {
        super(`machine ${machineId}: a machine must serve at least one platform`);
    }
}
