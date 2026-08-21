import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager, In } from "typeorm";

import { Page, PageRequest } from "../../../../application/pagination";
import { Project as ProjectEntity, ProjectData, IamBindingData } from "../../../../domain/entities/project/project";

import { Project } from "./typeorm/entities/project/project";
import { ProjectIamBinding } from "./typeorm/entities/project/project-iam-binding";
import { User } from "./typeorm/entities/user/user";
import { keysetPage } from "./typeorm/keyset-page";

type FindOneProjectParams = {
    id: string;
}

@Injectable()
export class ProjectDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async findOne(params: FindOneProjectParams): Promise<ProjectData | null> {
        const project = await this.dataSource.getRepository(Project).findOne({ where: params });

        return project ? this.withBindings(project) : null;
    }

    // Resolve a project by the identifier that appears in its URL: the human resource id if set, else the
    // uid. A resource_id can never be uuid-shaped, so `id = handle` and `resource_id = handle` never overlap.
    async findByHandle(handle: string): Promise<ProjectData | null> {
        const project = await this.dataSource.getRepository(Project)
            .createQueryBuilder("project")
            .leftJoinAndSelect("project.createdBy", "createdBy")
            .where("project.id::text = :handle OR project.resource_id = :handle", { handle })
            .getOne();

        return project ? this.withBindings(project) : null;
    }

    private async withBindings(project: Project): Promise<ProjectData> {
        const bindings = await this.bindingsByProject([project.id]);

        return this.toProjectData(project, bindings.get(project.id) ?? []);
    }

    async pageByMember(member: string, page: PageRequest): Promise<Page<ProjectData>> {
        const query = this.dataSource.getRepository(Project)
            .createQueryBuilder("project")
            .leftJoinAndSelect("project.createdBy", "createdBy")
            .where("project.id IN (SELECT b.project_id FROM project_iam_binding b WHERE b.member = :member)", { member });

        const { items, nextCursor } = await keysetPage(query, "project", page);

        if (items.length === 0) {
            return { items: [], nextCursor };
        }

        const bindings = await this.bindingsByProject(items.map((project) => project.id));

        return {
            items: items.map((project) => this.toProjectData(project, bindings.get(project.id) ?? [])),
            nextCursor,
        };
    }

    async saveOne(project: ProjectEntity): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(User).upsert(User.from(project.createdBy), ["id"]);
            await manager.getRepository(Project).save(Project.from(project));
            await this.replaceBindings(manager, project);
        });
    }

    private async replaceBindings(manager: EntityManager, project: ProjectEntity): Promise<void> {
        await manager.getRepository(ProjectIamBinding).delete({ projectId: project.id });

        const rows = project.iamPolicy().toBindings().flatMap((binding) => binding.memberValues().map((member) =>
            ProjectIamBinding.make(project.id, binding.role, member, project.createdAt, project.updatedAt)));

        if (rows.length > 0) {
            await manager.getRepository(ProjectIamBinding).save(rows);
        }
    }

    // Group the flat (role, member) rows of the given projects back into `{role, members[]}` bindings.
    private async bindingsByProject(projectIds: Array<string>): Promise<Map<string, Array<IamBindingData>>> {
        const rows = await this.dataSource.getRepository(ProjectIamBinding).find({ where: { projectId: In(projectIds) } });
        const grouped = new Map<string, Map<string, Array<string>>>();

        for (const row of rows) {
            const roles = grouped.get(row.projectId) ?? new Map<string, Array<string>>();
            roles.set(row.role, [...(roles.get(row.role) ?? []), row.member]);
            grouped.set(row.projectId, roles);
        }

        const result = new Map<string, Array<IamBindingData>>();

        for (const [projectId, roles] of grouped) {
            result.set(projectId, [...roles].map(([role, members]) => ({ role, members })));
        }

        return result;
    }

    private toProjectData(project: Project, bindings: Array<IamBindingData>): ProjectData {
        return {
            id: project.id,
            resourceId: project.resourceId,
            name: project.name,
            createdAt: project.createdAt,
            createdBy: {
                id: project.createdBy.id,
                externalId: project.createdBy.externalId,
                providerType: project.createdBy.providerType,
                createdAt: project.createdBy.createdAt,
                updatedAt: project.createdBy.updatedAt,
            },
            updatedAt: project.updatedAt,
            bindings,
        };
    }
}
