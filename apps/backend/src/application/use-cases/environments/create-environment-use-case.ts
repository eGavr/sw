import { Injectable } from "@nestjs/common";

import { ApplicationCatalog } from "../../../domain/entities/application-catalog/application-catalog";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { CloudAccountList } from "../../../domain/entities/cloud-account/cloud-account-list";
import { NoActiveCloudAccountError } from "../../../domain/entities/cloud-account/error/no-active-cloud-account-error";
import { Application } from "../../../domain/entities/environment/application/application";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { ApplicationSource } from "../../../domain/entities/environment/application/application-source";
import { RequestedApplication } from "../../../domain/entities/environment/application/requested-application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentQuota, EnvironmentQuotaPolicy } from "../../../domain/entities/environment/environment-quota";
import { defaultExecution, toExecution } from "../../../domain/entities/environment/execution";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { ResourceIdConflictError } from "../../../domain/entities/error/resource-id-conflict-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type CreateEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        environmentId?: string;
        platform: {
            name: string;
            version: string;
            deviceModel?: string;
        };
        execution?: string;
        applications: Array<{
            name: string;
            version?: string;
            source?: {
                appKey: string;
                webdriverKey?: string;
            };
        }>;
    },
}

@Injectable()
export class CreateEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly quotaPolicy: EnvironmentQuotaPolicy,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {}

    async execute({ creds, params }: CreateEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);

        // A chosen human id must be free within the project (uid-based names never collide with it).
        if (params.environmentId !== undefined
            && await this.environmentRepository.findByProjectAndHandle(projectId, params.environmentId)) {
            throw new ResourceIdConflictError(params.environmentId);
        }

        const execution = params.execution ? toExecution(params.execution) : defaultExecution;
        const cloudAccounts = await this.cloudAccountRepository.listByProject(projectId);
        const resolved = CloudAccountList.of(cloudAccounts).resolveFor(params.platform.name, execution);

        if (!resolved) {
            throw new NoActiveCloudAccountError(projectId.getValue());
        }

        const { cloudAccount, binding } = resolved;

        const platform = Platform.fromObject(params.platform);

        this.applicationCatalog.ensurePlatformSupported(platform);

        const applications = ApplicationList.create({
            applications: params.applications.map((application) => this.toApplication(platform, application)),
        });

        // The binding's quota is enforced right here, synchronously: a request past the limit gets an
        // immediate 429, not an asynchronous `failed` from the worker.
        const quota = EnvironmentQuota.fromBindingConfig(binding.config, this.quotaPolicy);

        return this.environmentRepository.create(
            {
                resourceId: params.environmentId,
                projectId,
                cloudAccountId: CloudAccountId.fromString(cloudAccount.id),
                cloudType: cloudAccount.type,
                computeKind: binding.kind,
                platform,
                execution,
                applications,
            },
            quota.toClaim(cloudAccount.id, params.platform.name, execution),
        );
    }

    // The boundary is loose, the environment is concrete. A catalog ask (no source) may use an alias
    // and a version prefix/latest — the catalog resolves it to the canonical name at its full version.
    // A custom ask brings the user's own artifact and must name its exact version itself: nobody but
    // the owner knows what "latest" of a private build is.
    private toApplication(
        platform: Platform,
        requested: CreateEnvironmentInput["params"]["applications"][number],
    ): Application {
        if (!requested.source) {
            return this.applicationCatalog.resolveProvided(
                platform.name,
                RequestedApplication.create(requested),
            );
        }

        if (requested.version === undefined) {
            throw new InvalidArgumentError(`application ${requested.name}: a custom source requires an exact version`);
        }

        return Application.create({
            name: requested.name,
            version: requested.version,
            source: ApplicationSource.custom(requested.source),
        });
    }
}
