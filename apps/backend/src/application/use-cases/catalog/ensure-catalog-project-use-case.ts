import { Injectable } from "@nestjs/common";

import { IamBinding } from "../../../domain/entities/project/iam/iam-binding";
import { IamPolicy } from "../../../domain/entities/project/iam/iam-policy";
import { Member } from "../../../domain/entities/project/iam/member";
import { RoleName } from "../../../domain/entities/project/iam/role";
import { Project } from "../../../domain/entities/project/project";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { catalogProjectHandle } from "../../../domain/entities/project-application/catalog-project";
import { ProjectApplication } from "../../../domain/entities/project-application/project-application";
import { User } from "../../../domain/entities/user/user";
import {
    ProjectApplicationRepository,
} from "../../interfaces/repositories/project-application-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";

export type CatalogSeedApplication = {
    readonly platformName: string;
    readonly name: string;
    readonly aliases: ReadonlyArray<string>;
    readonly versions: ReadonlyArray<{
        readonly version: string;
        readonly appRef?: string;
        readonly webdriverRef?: string;
    }>;
};

type EnsureCatalogProjectParams = {
    params: {
        adminExternalIds: ReadonlyArray<string>;
        seed: ReadonlyArray<CatalogSeedApplication>;
    },
};

// The system scenario behind every instance's startup: make sure the reserved catalog project exists,
// its install admins hold roles/admin, and a fresh install carries the default provided set. Runs on
// every boot (integration suites truncate the database between cases, so a migration would not
// survive), so every step is idempotent; a concurrent boot losing a create race just re-reads what the
// winner wrote — the unique constraints are the arbiter.
@Injectable()
export class EnsureCatalogProjectUseCase {
    constructor(
        private readonly projectRepository: ProjectRepository,
        private readonly projectApplicationRepository: ProjectApplicationRepository,
    ) {}

    async execute({ params }: EnsureCatalogProjectParams): Promise<void> {
        const project = await this.ensureProject();

        await this.ensureAdmins(project, params.adminExternalIds);
        await this.ensureSeeded(project, params.seed);
    }

    private async ensureProject(): Promise<Project> {
        const existing = await this.projectRepository.findByHandle(catalogProjectHandle);

        if (existing) {
            return existing;
        }

        try {
            const created = await this.projectRepository.create({
                resourceId: catalogProjectHandle,
                name: "Install catalog",
                createdBy: User.create({ externalId: catalogProjectHandle, providerType: "system" }),
            });

            return await this.projectRepository.save(created);
        } catch {
            return this.projectRepository.getByHandle(catalogProjectHandle);
        }
    }

    private async ensureAdmins(project: Project, adminExternalIds: ReadonlyArray<string>): Promise<void> {
        const admins = adminExternalIds.map((externalId) => Member.user(externalId));
        const policy = project.iamPolicy();
        const missing = admins.filter((admin) => !policy.rolesFor(admin).includes(RoleName.Admin));

        if (missing.length === 0) {
            return;
        }

        const kept = policy.toBindings().filter((binding) => binding.role !== RoleName.Admin);
        const currentAdmins = policy.toBindings()
            .filter((binding) => binding.role === RoleName.Admin)
            .flatMap((binding) => binding.memberValues());
        const adminMembers = [...new Set([...currentAdmins, ...admins.map((admin) => admin.getValue())])]
            .map((value) => Member.fromString(value));

        project.setIamPolicy(IamPolicy.fromBindings([...kept, IamBinding.create(RoleName.Admin, adminMembers)]));

        await this.projectRepository.save(project);
    }

    private async ensureSeeded(project: Project, seed: ReadonlyArray<CatalogSeedApplication>): Promise<void> {
        const projectId = ProjectId.fromString(project.id);

        if (await this.projectApplicationRepository.existsAny(projectId)) {
            return;
        }

        for (const entry of seed) {
            const application = ProjectApplication.create({
                projectId: project.id,
                platformName: entry.platformName,
                name: entry.name,
                aliases: [...entry.aliases],
            });

            for (const version of entry.versions) {
                application.addVersion(version);
            }

            // A concurrent boot may have seeded this application between the emptiness probe and here;
            // the unique (project, platform, name) constraint arbitrates and the loser moves on.
            await this.projectApplicationRepository.save(application).catch(() => undefined);
        }
    }
}
