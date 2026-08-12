import { ApplicationName } from "./application-name";
import { ApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    version: string;
};

export type ApplicationCreateParams = {
    name: string;
    version: string;
};

export class Application {
    static create(params: ApplicationCreateParams): Application {
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

    toObject(): ApplicationData {
        return {
            name: this.name,
            version: this.version,
        };
    }
}
