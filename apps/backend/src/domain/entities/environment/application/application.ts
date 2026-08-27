import { NonConcreteApplicationVersionError } from "../error/non-concrete-application-version-error";

import { ApplicationName } from "./application-name";
import { ApplicationVersion, latestApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    version: string;
};

export type ApplicationCreateParams = {
    name: string;
    version: string;
};

export class Application {
    // An environment's installed application must name an exact version; "latest" is reserved for a
    // session request to mean "the newest running environment", never an installed version.
    static create(params: ApplicationCreateParams): Application {
        if (params.version.toLowerCase() === latestApplicationVersion) {
            throw new NonConcreteApplicationVersionError(params.version);
        }

        return new Application(new ApplicationName(params.name), new ApplicationVersion(params.version));
    }

    static fromObject(data: ApplicationData): Application {
        return new Application(new ApplicationName(data.name), new ApplicationVersion(data.version));
    }

    private readonly _name: ApplicationName;
    private readonly _version: ApplicationVersion;

    private constructor(name: ApplicationName, version: ApplicationVersion) {
        this._name = name;
        this._version = version;
    }

    get name(): string {
        return this._name.getValue();
    }

    get version(): string {
        return this._version.getValue();
    }

    equals(other: Application): boolean {
        return this.name === other.name && this.version === other.version;
    }

    // Orders this application's version against another's (newest greater), for picking the latest.
    compareVersion(other: Application): number {
        return this._version.compareTo(other._version);
    }

    toObject(): ApplicationData {
        return {
            name: this.name,
            version: this.version,
        };
    }
}
