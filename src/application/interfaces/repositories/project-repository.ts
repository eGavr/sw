import { Project, ProjectCreateParams } from "../../../domain/entities/project/project";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { User } from "../../../domain/entities/user/user";
import { Page, PageRequest } from "../../pagination";

export abstract class ProjectRepository {
    abstract get(projectId: ProjectId): Promise<Project>;

    abstract find(projectId: ProjectId): Promise<Project | null>;

    // Resolve by the identifier used in the URL — the human resource id if one was set, else the uid.
    abstract getByHandle(handle: string): Promise<Project>;

    abstract findByHandle(handle: string): Promise<Project | null>;

    abstract listByUser(user: User, page: PageRequest): Promise<Page<Project>>;

    abstract create(params: ProjectCreateParams): Promise<Project>;

    abstract save(project: Project): Promise<Project>;
}
