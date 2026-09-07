import { ProjectId } from "../../../domain/entities/project/project-id";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";
import {
    ProjectApplicationVersion,
} from "../../../domain/entities/project-application/project-application-version";
import { Page, PageRequest } from "../../pagination";

export abstract class ProjectApplicationRepository {
    // Resolve within a project and platform by the identifier used in the URL — the server id or the
    // name alias.
    abstract findByHandle(projectId: ProjectId, platformName: string, handle: string): Promise<ProjectApplication | null>;

    abstract listByPlatform(projectId: ProjectId, platformName: string, page: PageRequest): Promise<Page<ProjectApplication>>;

    // The builds of one application as a page — the child collection read on its own.
    abstract listVersions(application: ProjectApplication, page: PageRequest): Promise<Page<ProjectApplicationVersion>>;

    // One read for the resolution vocabulary: the acting project's applications together with the
    // reserved catalog project's, keyed back apart by projectId.
    abstract listMany(projectIds: ReadonlyArray<ProjectId>): Promise<Array<ProjectApplication>>;

    // The caller builds the aggregate via ProjectApplication.create/addVersion; save covers both the
    // first write and every later build registration.
    abstract save(application: ProjectApplication): Promise<void>;

    abstract delete(application: ProjectApplication): Promise<void>;

    abstract existsAny(projectId: ProjectId): Promise<boolean>;
}
