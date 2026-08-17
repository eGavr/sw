import { Project, ProjectCreateParams } from "../../../domain/entities/project/project";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { User } from "../../../domain/entities/user/user";

export abstract class ProjectRepository {
    abstract get(projectId: ProjectId): Promise<Project>;

    abstract find(projectId: ProjectId): Promise<Project | null>;

    abstract listByUser(user: User): Promise<Array<Project>>;

    abstract create(params: ProjectCreateParams): Promise<Project>;

    abstract save(project: Project): Promise<Project>;
}
