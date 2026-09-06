import { NonConcreteApplicationVersionError } from "../error/non-concrete-application-version-error";

import { ApplicationName } from "./application-name";
import { ApplicationSource, ApplicationSourceData } from "./application-source";
import { ApplicationVersion, latestApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    version: string;
    source?: ApplicationSourceData;
};

export type ApplicationCreateParams = {
    name: string;
    version: string;
    source?: ApplicationSource;
};

export class Application {
    // An environment's installed application must name an exact version; "latest" is reserved for a
    // session request to mean "the newest running environment", never an installed version.
    static create(params: ApplicationCreateParams): Application {
        if (params.version.toLowerCase() === latestApplicationVersion) {
            throw new NonConcreteApplicationVersionError(params.version);
        }

        return new Application(
            new ApplicationName(params.name),
            new ApplicationVersion(params.version),
            params.source ?? ApplicationSource.provided(),
        );
    }

    static fromObject(data: ApplicationData): Application {
        return new Application(
            new ApplicationName(data.name),
            new ApplicationVersion(data.version),
            ApplicationSource.fromObject(data.source),
        );
    }

    private readonly _name: ApplicationName;
    private readonly _version: ApplicationVersion;
    private readonly _source: ApplicationSource;

    private constructor(name: ApplicationName, version: ApplicationVersion, source: ApplicationSource) {
        this._name = name;
        this._version = version;
        this._source = source;
    }

    get name(): string {
        return this._name.getValue();
    }

    get version(): string {
        return this._version.getValue();
    }

    get source(): ApplicationSource {
        return this._source;
    }

    // Identity is name+version; the source is provenance, not identity.
    equals(other: Application): boolean {
        return this.name === other.name && this.version === other.version;
    }

    // Orders this application's version against another's (newest greater), for picking the latest.
    compareVersion(other: Application): number {
        return this._version.compareTo(other._version);
    }

    matchesVersionPrefix(prefix: string): boolean {
        return this._version.matchesPrefix(prefix);
    }

    toObject(): ApplicationData {
        return {
            name: this.name,
            version: this.version,
            source: this._source.toObject(),
        };
    }
}
