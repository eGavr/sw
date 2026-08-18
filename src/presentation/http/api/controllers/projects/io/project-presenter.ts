import { Project } from "../../../../../../domain/entities/project/project";
import { Presenter } from "../../../../presenters/presenter";

export class ProjectPresenter implements Presenter {
    constructor(private readonly project: Project) {}

    present(): object {
        return {
            name: `projects/${this.project.id}`,
            uid: this.project.id,
            displayName: this.project.name,
            createTime: this.project.createdAt.toISOString(),
            updateTime: this.project.updatedAt.toISOString(),
        };
    }
}
