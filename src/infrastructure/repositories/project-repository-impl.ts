import { Injectable } from "@nestjs/common";

import { ProjectRepository } from "../../application/interfaces/repositories/project-repository";
import { NotFoundResourceError } from "../../domain/entities/error/not-found/not-found-resource-error";
import { Member } from "../../domain/entities/project/iam/member";
import { Project, ProjectCreateParams } from "../../domain/entities/project/project";
import { ProjectId } from "../../domain/entities/project/project-id";
import { User } from "../../domain/entities/user/user";
import { ProjectDataSource } from "../data-sources/database/postgres/project-data-source";

@Injectable()
export class ProjectRepositoryImpl extends ProjectRepository {
    constructor(private readonly projectDataSource: ProjectDataSource) {
        super();
    }

    async get(projectId: ProjectId): Promise<Project> {
        const project = await this.find(projectId);

        if (!project) {
            throw new NotFoundResourceError(projectId.getValue());
        }

        return project;
    }

    async find(projectId: ProjectId): Promise<Project | null> {
        const data = await this.projectDataSource.findOne({ id: projectId.getValue() });

        return data ? Project.fromObject(data) : null;
    }

    async listByUser(user: User): Promise<Array<Project>> {
        const data = await this.projectDataSource.findAllByMember(Member.user(user.externalId).getValue());

        return data.map(Project.fromObject);
    }

    async create(params: ProjectCreateParams): Promise<Project> {
        return Project.create(params);
    }

    async save(project: Project): Promise<Project> {
        await this.projectDataSource.saveOne(project);

        return project;
    }
}
