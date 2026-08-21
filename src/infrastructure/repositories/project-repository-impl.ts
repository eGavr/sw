import { Injectable } from "@nestjs/common";

import { ProjectRepository } from "../../application/interfaces/repositories/project-repository";
import { Page, PageRequest } from "../../application/pagination";
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

    async getByHandle(handle: string): Promise<Project> {
        const project = await this.findByHandle(handle);

        if (!project) {
            throw new NotFoundResourceError(handle);
        }

        return project;
    }

    async findByHandle(handle: string): Promise<Project | null> {
        const data = await this.projectDataSource.findByHandle(handle);

        return data ? Project.fromObject(data) : null;
    }

    async listByUser(user: User, page: PageRequest): Promise<Page<Project>> {
        const result = await this.projectDataSource.pageByMember(Member.user(user.externalId).getValue(), page);

        return { items: result.items.map(Project.fromObject), nextCursor: result.nextCursor };
    }

    async create(params: ProjectCreateParams): Promise<Project> {
        return Project.create(params);
    }

    async save(project: Project): Promise<Project> {
        await this.projectDataSource.saveOne(project);

        return project;
    }
}
