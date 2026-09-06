import { PlatformLine } from "../../../../../../domain/entities/application-catalog/platform-catalog";
import { Presenter } from "../../../../presenters/presenter";

// One platform base-image line the install provisions: the OS name and the versions it exists for.
export class PlatformPresenter implements Presenter {
    constructor(private readonly line: PlatformLine) {}

    present(): object {
        return {
            name: `platforms/${this.line.name}`,
            platform: this.line.name,
            versions: [...this.line.versions],
        };
    }
}

export class ListPlatformsPresenter implements Presenter {
    constructor(private readonly lines: ReadonlyArray<PlatformLine>) {}

    present(): object {
        return { platforms: this.lines.map((line) => new PlatformPresenter(line).present()) };
    }
}
