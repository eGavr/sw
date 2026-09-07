import { Injectable } from "@nestjs/common";

import {
    ProjectApplicationRepository,
} from "../../application/interfaces/repositories/project-application-repository";
import { Page, PageRequest } from "../../application/pagination";
import { ProjectId } from "../../domain/entities/project/project-id";
import { ProjectApplication } from "../../domain/entities/project-application/project-application";
import {
    ProjectApplicationVersion,
} from "../../domain/entities/project-application/project-application-version";
import {
    ProjectApplicationDataSource,
} from "../data-sources/database/postgres/project-application-data-source";

@Injectable()
export class ProjectApplicationRepositoryImpl extends ProjectApplicationRepository {
    constructor(private readonly projectApplicationDataSource: ProjectApplicationDataSource) {
        super();
    }

    async findByHandle(projectId: ProjectId, platformName: string, handle: string): Promise<ProjectApplication | null> {
        const data = await this.projectApplicationDataSource.findByHandle(projectId.getValue(), platformName, handle);

        return data ? ProjectApplication.fromObject(data) : null;
    }

    async listByPlatform(
        projectId: ProjectId,
        platformName: string,
        page: PageRequest,
    ): Promise<Page<ProjectApplication>> {
        const { items, nextCursor } = await this.projectApplicationDataSource
            .pageByProject(projectId.getValue(), platformName, page);

        return { items: items.map(ProjectApplication.fromObject), nextCursor };
    }

    async listVersions(application: ProjectApplication, page: PageRequest): Promise<Page<ProjectApplicationVersion>> {
        const { items, nextCursor } = await this.projectApplicationDataSource.pageVersions(application.id, page);

        return { items: items.map(ProjectApplicationVersion.fromObject), nextCursor };
    }

    async listMany(projectIds: ReadonlyArray<ProjectId>): Promise<Array<ProjectApplication>> {
        const data = await this.projectApplicationDataSource.listByProjects(
            projectIds.map((projectId) => projectId.getValue()),
        );

        return data.map(ProjectApplication.fromObject);
    }

    async save(application: ProjectApplication): Promise<void> {
        await this.projectApplicationDataSource.save(application);
    }

    async delete(application: ProjectApplication): Promise<void> {
        await this.projectApplicationDataSource.delete(application.id);
    }

    async existsAny(projectId: ProjectId): Promise<boolean> {
        return (await this.projectApplicationDataSource.countByProject(projectId.getValue())) > 0;
    }
}
