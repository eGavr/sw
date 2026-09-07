import { InvalidArgumentError } from "../../error/invalid-argument-error";

import { DeviceModel } from "./device-model";
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
    deviceModel: string;
};

// The stereotype a session is matched on: which OS at which version on which kind of device. Every
// field is a real value — a desktop environment's device is `desktop`, never a null "does not apply".
export class Platform {
    static create(params: PlatformCreateParams): Platform {
        return new Platform(params.name, new PlatformVersion(params.version), new DeviceModel(params.deviceModel));
    }

    static fromObject(data: PlatformData): Platform {
        return Platform.create({
            name: Platform.toName(data.name),
            version: data.version,
            deviceModel: data.deviceModel,
        });
    }

    private static toName(value: string): PlatformName {
        const name = Object.values(PlatformName).find((candidate) => candidate === value);

        if (!name) {
            throw new InvalidArgumentError(`platform name: ${value}: unknown`);
        }

        return name;
    }

    private constructor(
        private readonly _name: PlatformName,
        private readonly _version: PlatformVersion,
        private readonly _deviceModel: DeviceModel,
    ) {}

    get name(): PlatformName {
        return this._name;
    }

    get version(): string {
        return this._version.getValue();
    }

    get deviceModel(): string {
        return this._deviceModel.getValue();
    }

    matchesVersionPrefix(prefix: string): boolean {
        return this._version.matchesPrefix(prefix);
    }

    isDevice(model: DeviceModel): boolean {
        return this._deviceModel.equals(model);
    }

    equals(other: Platform): boolean {
        return this._name === other._name && this.version === other.version && this.deviceModel === other.deviceModel;
    }

    toObject(): PlatformData {
        return {
            name: this._name,
            version: this.version,
            deviceModel: this.deviceModel,
        };
    }
}
