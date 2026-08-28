import { FailedPreconditionError } from "../../error/failed-precondition-error";

// Nothing in the project offers the requested application on the requested substrate — not even a
// provisioning environment — so a retry cannot help until one is created.
export class NoEnvironmentOffersApplicationError extends FailedPreconditionError {
    constructor(applicationName: string, applicationVersion: string, execution: string) {
        super(
            `session: no environment offers ${applicationName} ${applicationVersion} on ${execution} — create one first`,
        );
    }
}
