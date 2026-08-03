import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { ApplicationKind } from "./application-kind";
import { ApplicationName } from "./application-name";
import { ApplicationVersion } from "./application-version";

export type ApplicationData = {
    name: string;
    version: string;
    kind: string;
};

export type ApplicationCreateParams = {
    name: string;
    version: string;
    kind: ApplicationKind;
};

export class Application {
    static create(params: ApplicationCreateParams): Application {
        return new Application(new ApplicationName(params.name), new ApplicationVersion(params.version), params.kind);
    }

    static fromObject(data: ApplicationData): Application {
        return new Application(new ApplicationName(data.name), new ApplicationVersion(data.version), Application.toKind(data.kind));
    }

    private static toKind(value: string): ApplicationKind {
        const kind = Object.values(ApplicationKind).find((candidate) => candidate === value);

        if (!kind) {
            throw new InvalidArgumentError(`application kind: ${value}: unknown`);
        }

        return kind;
    }

    private readonly _name: ApplicationName;
    private readonly _version: ApplicationVersion;
    private readonly _kind: ApplicationKind;

    private constructor(name: ApplicationName, version: ApplicationVersion, kind: ApplicationKind) {
        this._name = name;
        this._version = version;
        this._kind = kind;
    }

    get name(): string {
        return this._name.getValue();
    }

    get version(): string {
        return this._version.getValue();
    }

    get kind(): ApplicationKind {
        return this._kind;
    }

    equals(other: Application): boolean {
        return this.name === other.name && this.version === other.version && this._kind === other._kind;
    }

    toObject(): ApplicationData {
        return {
            name: this.name,
            version: this.version,
            kind: this._kind,
        };
    }
}
