import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager, In } from "typeorm";

import { Project as ProjectEntity, ProjectData, IamBindingData } from "../../../../domain/entities/project/project";

import { Project } from "./typeorm/entities/project/project";
import { ProjectIamBinding } from "./typeorm/entities/project/project-iam-binding";
import { User } from "./typeorm/entities/user/user";

type FindOneAccountParams = {
    id: string;
}

@Injectable()
export class ProjectDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async findOne(params: FindOneAccountParams): Promise<ProjectData | null> {
        const project = await this.dataSource.getRepository(Project).findOne({ where: params });

        if (!project) {
            return null;
        }

        const bindings = await this.bindingsByAccount([project.id]);

        return this.toAccountData(project, bindings.get(project.id) ?? []);
    }

    async findAllByMember(member: string): Promise<Array<ProjectData>> {
        const rows = await this.dataSource.getRepository(ProjectIamBinding).find({ where: { member } });
        const ids = [...new Set(rows.map((row) => row.projectId))];

        if (ids.length === 0) {
            return [];
        }

        const projects = await this.dataSource.getRepository(Project).find({ where: { id: In(ids) } });
        const bindings = await this.bindingsByAccount(ids);

        return projects.map((project) => this.toAccountData(project, bindings.get(project.id) ?? []));
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
    private async bindingsByAccount(projectIds: Array<string>): Promise<Map<string, Array<IamBindingData>>> {
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

    private toAccountData(project: Project, bindings: Array<IamBindingData>): ProjectData {
        return {
            id: project.id,
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
