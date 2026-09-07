import { PlatformLine } from "../../../../../../domain/entities/application-catalog/platform-catalog";
import { Presenter } from "../../../../presenters/presenter";

// One platform base-image line the install provisions: the OS name, the versions it exists for and
// the device kinds an environment on it can be.
export class PlatformPresenter implements Presenter {
    constructor(private readonly line: PlatformLine) {}

    present(): object {
        return {
            name: `platforms/${this.line.name}`,
            platform: this.line.name,
            versions: [...this.line.versions],
            devices: this.line.devices.map((device) => ({ id: device.id, displayName: device.displayName })),
        };
    }
}

export class ListPlatformsPresenter implements Presenter {
    constructor(private readonly lines: ReadonlyArray<PlatformLine>) {}

    present(): object {
        return { platforms: this.lines.map((line) => new PlatformPresenter(line).present()) };
    }
}
