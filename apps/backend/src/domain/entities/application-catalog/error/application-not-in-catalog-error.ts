import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class ApplicationNotInCatalogError extends InvalidArgumentError {
    constructor(platformName: string, applicationName: string, version: string | null) {
        super(
            `application ${applicationName}${version ? ` ${version}` : ""} on ${platformName}: `
            + "not in the provided catalog — pick a catalog application or attach a custom source",
        );
    }
}
