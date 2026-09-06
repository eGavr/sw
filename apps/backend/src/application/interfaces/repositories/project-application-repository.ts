import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";

export abstract class ProjectApplicationRepository {
    abstract find(projectId: ProjectId, platformName: string, name: string): Promise<ProjectApplication | null>;

    abstract list(projectId: ProjectId, platformName?: string): Promise<Array<ProjectApplication>>;

    // One read for the resolution vocabulary: the acting project's applications together with the
    // reserved catalog project's, keyed back apart by projectId.
    abstract listMany(projectIds: ReadonlyArray<ProjectId>): Promise<Array<ProjectApplication>>;

    // The caller builds the aggregate via ProjectApplication.create/addVersion; save covers both the
    // first write and every later build registration.
    abstract save(application: ProjectApplication): Promise<void>;

    abstract delete(application: ProjectApplication): Promise<void>;

    abstract existsAny(projectId: ProjectId): Promise<boolean>;
}
