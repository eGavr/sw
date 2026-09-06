import {
    ProjectApplication,
} from "../../../../../../domain/entities/project-application/project-application";
import { Presenter } from "../../../../presenters/presenter";

// One application registered in a project: the canonical reverse-DNS id (the resource id) and — in
// the catalog project — the wire aliases it answers to. Its versions are the child collection;
// artifact refs live on versions and stay out of this shape.
export class ProjectApplicationPresenter implements Presenter {
    constructor(private readonly projectHandle: string, private readonly application: ProjectApplication) {}

    present(): object {
        return {
            name: `projects/${this.projectHandle}/platforms/${this.application.platformName}`
                + `/applications/${this.application.name}`,
            application: this.application.name,
            aliases: [...this.application.aliases],
            createTime: this.application.createdAt.toISOString(),
        };
    }
}

export class ListProjectApplicationsPresenter implements Presenter {
    constructor(
        private readonly projectHandle: string,
        private readonly applications: ReadonlyArray<ProjectApplication>,
    ) {}

    present(): object {
        return {
            applications: this.applications.map((application) =>
                new ProjectApplicationPresenter(this.projectHandle, application).present()),
        };
    }
}
