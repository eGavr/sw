import { Injectable } from "@nestjs/common";
import { DataSource, In } from "typeorm";

import { Page, PageRequest } from "../../../../application/pagination";
import {
    ProjectApplication as ProjectApplicationEntity,
    ProjectApplicationData,
} from "../../../../domain/entities/project-application/project-application";
import {
    ProjectApplicationVersionData,
} from "../../../../domain/entities/project-application/project-application-version";

import { ProjectApplication } from "./typeorm/entities/project-application/project-application";
import { ProjectApplicationVersion } from "./typeorm/entities/project-application/project-application-version";
import { keysetPage } from "./typeorm/keyset-page";

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

    // Resolve within a project and platform by the identifier used in the URL: the server id or the
    // name alias. The eager `versions` relation is not auto-loaded by the query builder, so it is joined
    // explicitly. `id::text` avoids a uuid-syntax error when the handle is a word.
    async findByHandle(projectId: string, platformName: string, handle: string): Promise<ProjectApplicationData | null> {
        const row = await this.dataSource.getRepository(ProjectApplication)
            .createQueryBuilder("application")
            .leftJoinAndSelect("application.versions", "versions")
            .where("application.projectId = :projectId", { projectId })
            .andWhere("application.platformName = :platformName", { platformName })
            .andWhere("(application.id::text = :handle OR application.nameAlias = :handle)", { handle })
            .getOne();

        return row?.toObject() ?? null;
    }

    async pageByProject(projectId: string, platformName: string, page: PageRequest): Promise<Page<ProjectApplicationData>> {
        const query = this.dataSource.getRepository(ProjectApplication)
            .createQueryBuilder("application")
            .leftJoinAndSelect("application.versions", "versions")
            .where("application.projectId = :projectId", { projectId })
            .andWhere("application.platformName = :platformName", { platformName });

        const { items, nextCursor } = await keysetPage(query, "application", page);

        return { items: items.map((row) => row.toObject()), nextCursor };
    }

    async pageVersions(applicationId: string, page: PageRequest): Promise<Page<ProjectApplicationVersionData>> {
        const query = this.dataSource.getRepository(ProjectApplicationVersion)
            .createQueryBuilder("version")
            .where("version.projectApplicationId = :applicationId", { applicationId });

        const { items, nextCursor } = await keysetPage(query, "version", page);

        return { items: items.map((row) => row.toObject()), nextCursor };
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
