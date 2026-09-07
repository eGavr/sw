import {
    ProjectApplication,
} from "../../../../../../domain/entities/project-application/project-application";
import { Presenter } from "../../../../presenters/presenter";

// One application registered in a project: a resource by its server id, addressed by its name alias
// (the word). Its versions are the child collection; artifact refs live on versions and stay out of
// this shape.
export class ProjectApplicationPresenter implements Presenter {
    constructor(private readonly projectHandle: string, private readonly application: ProjectApplication) {}

    present(): object {
        return {
            name: `projects/${this.projectHandle}/platforms/${this.application.platformName}`
                + `/applications/${this.application.id}`,
            uid: this.application.id,
            nameAlias: this.application.nameAlias,
            createTime: this.application.createdAt.toISOString(),
        };
    }
}

export class ListProjectApplicationsPresenter implements Presenter {
    constructor(
        private readonly projectHandle: string,
        private readonly applications: ReadonlyArray<ProjectApplication>,
        private readonly nextPageToken?: string,
    ) {}

    present(): object {
        return {
            applications: this.applications.map((application) =>
                new ProjectApplicationPresenter(this.projectHandle, application).present()),
            nextPageToken: this.nextPageToken,
        };
    }
}
