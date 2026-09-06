import { Presenter } from "../../../../presenters/presenter";

// One version the install delivers an application at. Today the resource carries only its id; the
// baking pipeline's attributes (channel, checksums, release time) will land here, not in a new shape.
export class ApplicationVersionPresenter implements Presenter {
    constructor(
        private readonly platform: string,
        private readonly application: string,
        private readonly version: string,
    ) {}

    present(): object {
        return {
            name: `platforms/${this.platform}/applications/${this.application}/versions/${this.version}`,
            version: this.version,
        };
    }
}

export class ListApplicationVersionsPresenter implements Presenter {
    constructor(
        private readonly platform: string,
        private readonly application: string,
        private readonly versions: ReadonlyArray<string>,
    ) {}

    present(): object {
        return {
            versions: this.versions.map((version) =>
                new ApplicationVersionPresenter(this.platform, this.application, version).present()),
        };
    }
}
