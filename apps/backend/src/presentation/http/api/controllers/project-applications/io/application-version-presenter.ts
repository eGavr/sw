import {
    ProjectApplication,
} from "../../../../../../domain/entities/project-application/project-application";
import {
    ProjectApplicationVersion,
} from "../../../../../../domain/entities/project-application/project-application-version";
import { Presenter } from "../../../../presenters/presenter";

// One registered build. The refs are echoed for a CUSTOM build — they are the owner's own bucket
// keys; the catalog project's artifact locations are the install's internals and are not published
// (its reads are public — a version there shows only its id).
export class ApplicationVersionPresenter implements Presenter {
    constructor(
        private readonly projectHandle: string,
        private readonly application: ProjectApplication,
        private readonly version: ProjectApplicationVersion,
        private readonly exposeRefs: boolean,
    ) {}

    present(): object {
        return {
            name: `projects/${this.projectHandle}/platforms/${this.application.platformName}`
                + `/applications/${this.application.name}/versions/${this.version.version}`,
            version: this.version.version,
            ...(this.exposeRefs && this.version.appRef !== null ? { appRef: this.version.appRef } : {}),
            ...(this.exposeRefs && this.version.webdriverRef !== null
                ? { webdriverRef: this.version.webdriverRef }
                : {}),
        };
    }
}

export class ListApplicationVersionsPresenter implements Presenter {
    constructor(
        private readonly projectHandle: string,
        private readonly application: ProjectApplication,
        private readonly exposeRefs: boolean,
    ) {}

    present(): object {
        return {
            versions: this.application.versionsNewestFirst().map((version) =>
                new ApplicationVersionPresenter(this.projectHandle, this.application, version, this.exposeRefs)
                    .present()),
        };
    }
}
