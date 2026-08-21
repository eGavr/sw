import { Project } from "../../../../../../domain/entities/project/project";
import { Presenter } from "../../../../presenters/presenter";

export class ProjectPresenter implements Presenter {
    constructor(private readonly project: Project) {}

    present(): object {
        // The resource is addressed by its human id when set, else by its uid; `uid` is always the uuid.
        return {
            name: `projects/${this.project.resourceId ?? this.project.id}`,
            uid: this.project.id,
            displayName: this.project.name,
            createTime: this.project.createdAt.toISOString(),
            updateTime: this.project.updatedAt.toISOString(),
        };
    }
}
