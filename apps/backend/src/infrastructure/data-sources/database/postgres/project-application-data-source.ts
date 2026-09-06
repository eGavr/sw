import { Injectable } from "@nestjs/common";
import { DataSource, In } from "typeorm";

import {
    ProjectApplication as ProjectApplicationEntity,
    ProjectApplicationData,
} from "../../../../domain/entities/project-application/project-application";

import { ProjectApplication } from "./typeorm/entities/project-application/project-application";
import { ProjectApplicationVersion } from "./typeorm/entities/project-application/project-application-version";

@Injectable()
export class ProjectApplicationDataSource {
    constructor(private readonly dataSource: DataSource) {}

    // Saves the aggregate whole: the application row and its versions in one transaction (versions of
    // one application are one consistency boundary — a build must never appear detached).
    async save(application: ProjectApplicationEntity): Promise<void> {
        const row = ProjectApplication.from(application);

        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(ProjectApplication).save(row);
            await manager.getRepository(ProjectApplicationVersion).delete({ projectApplicationId: row.id });
            await manager.getRepository(ProjectApplicationVersion).save(row.versions);
        });
    }

    async findOne(projectId: string, platformName: string, name: string): Promise<ProjectApplicationData | null> {
        const row = await this.dataSource.getRepository(ProjectApplication)
            .findOne({ where: { projectId, platformName, name } });

        return row?.toObject() ?? null;
    }

    async listByProject(projectId: string, platformName?: string): Promise<Array<ProjectApplicationData>> {
        const rows = await this.dataSource.getRepository(ProjectApplication)
            .find({ where: platformName === undefined ? { projectId } : { projectId, platformName } });

        return rows.map((row) => row.toObject());
    }

    async listByProjects(projectIds: Array<string>): Promise<Array<ProjectApplicationData>> {
        if (projectIds.length === 0) {
            return [];
        }

        const rows = await this.dataSource.getRepository(ProjectApplication)
            .find({ where: { projectId: In(projectIds) } });

        return rows.map((row) => row.toObject());
    }

    async delete(id: string): Promise<void> {
        await this.dataSource.getRepository(ProjectApplication).delete({ id });
    }

    async countByProject(projectId: string): Promise<number> {
        return this.dataSource.getRepository(ProjectApplication).count({ where: { projectId } });
    }
}
