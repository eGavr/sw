import {
    ProjectApplication,
} from "../../../../../../domain/entities/project-application/project-application";
import {
    ProjectApplicationVersion,
} from "../../../../../../domain/entities/project-application/project-application-version";
import { Presenter } from "../../../../presenters/presenter";

// One registered build: a resource by its server id, addressed by its version alias (the owner's
// label) — nobody declares a version, the honest one is detected on environments. What the build
// delivers is public: whether it is preinstalled (no artifact — the platform image ships it) and
// whether a paired webdriver comes along. The refs themselves are echoed for a CUSTOM build — they are
// the owner's own bucket keys; the catalog project's artifact locations are the install's internals
// and are not published.
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
                + `/applications/${this.application.id}/versions/${this.version.id}`,
            uid: this.version.id,
            versionAlias: this.version.versionAlias,
            preinstalled: this.version.appRef === null,
            webdriver: this.version.webdriverRef !== null,
            ...(this.exposeRefs && this.version.appRef !== null ? { appRef: this.version.appRef } : {}),
            ...(this.exposeRefs && this.version.webdriverRef !== null
                ? { webdriverRef: this.version.webdriverRef }
                : {}),
            createTime: this.version.createdAt.toISOString(),
        };
    }
}

export class ListApplicationVersionsPresenter implements Presenter {
    constructor(
        private readonly projectHandle: string,
        private readonly application: ProjectApplication,
        private readonly versions: ReadonlyArray<ProjectApplicationVersion>,
        private readonly exposeRefs: boolean,
        private readonly nextPageToken?: string,
    ) {}

    present(): object {
        return {
            versions: this.versions.map((version) =>
                new ApplicationVersionPresenter(this.projectHandle, this.application, version, this.exposeRefs)
                    .present()),
            nextPageToken: this.nextPageToken,
        };
    }
}
