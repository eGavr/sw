import { Injectable } from "@nestjs/common";

import { ApplicationCatalog } from "../../domain/entities/application-catalog/application-catalog";
import { ProjectId } from "../../domain/entities/project/project-id";
import { catalogProjectHandle } from "../../domain/entities/project-application/catalog-project";
import { ProjectApplication } from "../../domain/entities/project-application/project-application";
import { ProjectApplicationRepository } from "../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../interfaces/repositories/project-repository";

// Assembles the vocabulary one project resolves application words against: the reserved catalog
// project's applications (the install's provided set) plus the project's own registered customs —
// one read, split back apart by owner. Used by every scenario that turns a word into a concrete
// application (create-environment, session allocation, registration validation).
@Injectable()
export class ApplicationCatalogLoader {
    constructor(
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
    ) {}

    async loadFor(projectId: ProjectId): Promise<ApplicationCatalog> {
        const catalogProject = await this.projectRepository.findByHandle(catalogProjectHandle);
        const catalogProjectId = catalogProject?.id ?? null;

        const projectIds = catalogProjectId !== null && catalogProjectId !== projectId.getValue()
            ? [projectId, ProjectId.fromString(catalogProjectId)]
            : [projectId];

        const applications = await this.projectApplicationRepository.listMany(projectIds);
        const isProvided = (application: ProjectApplication): boolean => application.projectId === catalogProjectId;

        return ApplicationCatalog.of({
            catalog: applications.filter(isProvided),
            own: applications.filter((application) => !isProvided(application)),
        });
    }
}
