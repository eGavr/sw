import { FailedPreconditionError } from "../../error/failed-precondition-error";

// Nothing in the project offers the requested application where it was asked to run (platform and
// substrate) — not even a provisioning environment — so a retry cannot help until one is created.
export class NoEnvironmentOffersApplicationError extends FailedPreconditionError {
    constructor(applicationName: string, applicationVersion: string, stereotype: string) {
        super(
            `session: no environment offers ${applicationName} ${applicationVersion} on ${stereotype} — create one first`,
        );
    }
}
