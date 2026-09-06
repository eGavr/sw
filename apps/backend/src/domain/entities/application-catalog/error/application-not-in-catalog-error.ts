import { InvalidArgumentError } from "../../error/invalid-argument-error";

export class ApplicationNotInCatalogError extends InvalidArgumentError {
    constructor(platformName: string, applicationName: string, version: string | null) {
        super(
            `application ${applicationName}${version ? ` ${version}` : ""} on ${platformName}: `
            + "neither the install catalog nor the project registers it — pick a catalog application "
            + "or register your build in the project first",
        );
    }
}
