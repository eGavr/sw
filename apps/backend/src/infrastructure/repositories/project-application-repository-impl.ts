import { Injectable } from "@nestjs/common";

import {
    ProjectApplicationRepository,
} from "../../application/interfaces/repositories/project-application-repository";
import { ProjectId } from "../../domain/entities/project/project-id";
import { ProjectApplication } from "../../domain/entities/project-application/project-application";
import {
    ProjectApplicationDataSource,
} from "../data-sources/database/postgres/project-application-data-source";

@Injectable()
export class ProjectApplicationRepositoryImpl extends ProjectApplicationRepository {
    constructor(private readonly projectApplicationDataSource: ProjectApplicationDataSource) {
        super();
    }

    async find(projectId: ProjectId, platformName: string, name: string): Promise<ProjectApplication | null> {
        const data = await this.projectApplicationDataSource.findOne(projectId.getValue(), platformName, name);

        return data ? ProjectApplication.fromObject(data) : null;
    }

    async list(projectId: ProjectId, platformName?: string): Promise<Array<ProjectApplication>> {
        const data = await this.projectApplicationDataSource.listByProject(projectId.getValue(), platformName);

        return data.map(ProjectApplication.fromObject);
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
