import { Project } from "../../../../../../domain/entities/project/project";
import { Presenter } from "../../../../presenters/presenter";

import { ProjectPresenter } from "./project-presenter";

export class ListAccountsPresenter implements Presenter {
    constructor(
        private readonly projects: Array<Project>,
        private readonly nextPageToken?: string,
    ) {}

    present(): object {
        return {
            projects: this.projects.map((project) => new ProjectPresenter(project).present()),
            nextPageToken: this.nextPageToken,
        };
    }
}
