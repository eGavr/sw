import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { PlatformName } from "./platform-name";
import { PlatformVersion } from "./platform-version";

export type PlatformData = {
    name: string;
    version: string;
    deviceModel: string;
};

export type PlatformCreateParams = {
    name: PlatformName;
    version: string;
    deviceModel?: string;
};

export class Platform {
    static create(params: PlatformCreateParams): Platform {
        // device_name is a match capability and stays a real non-null value: a desktop env has no
        // device, so it defaults to the platform name rather than a null/sentinel.
        return new Platform(params.name, new PlatformVersion(params.version), params.deviceModel ?? params.name);
    }

    static fromObject(data: { name: string; version: string; deviceModel?: string | null }): Platform {
        return Platform.create({
            name: Platform.toName(data.name),
            version: data.version,
            deviceModel: data.deviceModel ?? undefined,
        });
    }

    private static toName(value: string): PlatformName {
        const name = Object.values(PlatformName).find((candidate) => candidate === value);

        if (!name) {
            throw new InvalidArgumentError(`platform name: ${value}: unknown`);
        }

        return name;
    }

    private readonly _name: PlatformName;
    private readonly _version: PlatformVersion;
    private readonly _deviceModel: string;

    private constructor(name: PlatformName, version: PlatformVersion, deviceModel: string) {
        this._name = name;
        this._version = version;
        this._deviceModel = deviceModel;
    }

    get name(): PlatformName {
        return this._name;
    }

    get version(): string {
        return this._version.getValue();
    }

    get deviceModel(): string {
        return this._deviceModel;
    }

    equals(other: Platform): boolean {
        return this._name === other._name && this.version === other.version && this._deviceModel === other._deviceModel;
    }

    toObject(): PlatformData {
        return {
            name: this._name,
            version: this.version,
            deviceModel: this._deviceModel,
        };
    }
}
