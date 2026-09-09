import { Injectable } from "@nestjs/common";

import { PlatformCatalog } from "../../../domain/entities/application-catalog/platform-catalog";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { CloudAccountList, Placement } from "../../../domain/entities/cloud-account/cloud-account-list";
import {
    AmbiguousPlacementError,
} from "../../../domain/entities/cloud-account/error/ambiguous-placement-error";
import {
    CloudDoesNotServeError,
} from "../../../domain/entities/cloud-account/error/cloud-does-not-serve-error";
import { NoActiveCloudAccountError } from "../../../domain/entities/cloud-account/error/no-active-cloud-account-error";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { RequestedApplication } from "../../../domain/entities/environment/application/requested-application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { EnvironmentQuota, EnvironmentQuotaPolicy } from "../../../domain/entities/environment/environment-quota";
import { defaultExecution, Execution, toExecution } from "../../../domain/entities/environment/execution";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { ResourceIdConflictError } from "../../../domain/entities/error/resource-id-conflict-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ensureNotCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";
import { ApplicationCatalogLoader } from "../../services/application-catalog-loader";

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
            nameAlias: string;
            versionAlias?: string;
        }>;
        // Which cloud of the project runs it (its uid). Required exactly when several serve the
        // substrate — with one there is nothing to choose and nothing hidden.
        cloudAccountId?: string;
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
        private readonly platformCatalog: PlatformCatalog,
        private readonly applicationCatalogLoader: ApplicationCatalogLoader,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute({ creds, params }: CreateEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        ensureNotCatalogProject(project, "creating environments");

        const projectId = ProjectId.fromString(project.id);

        // A chosen human id must be free within the project (uid-based names never collide with it).
        if (params.environmentId !== undefined
            && await this.environmentRepository.findByProjectAndHandle(projectId, params.environmentId)) {
            throw new ResourceIdConflictError(params.environmentId);
        }

        const execution = params.execution ? toExecution(params.execution) : defaultExecution;
        const clouds = CloudAccountList.of(await this.cloudAccountRepository.listByProject(projectId));
        const { cloudAccount, binding } = this.placement(clouds, params, execution, projectId);

        // The device kind is the line's business: the word typed folds to a catalog id, an untyped one
        // is implied when the line offers a single kind.
        const platform = Platform.fromObject({
            name: params.platform.name,
            version: params.platform.version,
            deviceModel: this.platformCatalog.resolveDeviceModel(params.platform.name, params.platform.deviceModel).getValue(),
        });

        this.platformCatalog.ensurePlatformSupported(platform);

        // The boundary is loose, the environment is concrete: every word resolves through the project's
        // vocabulary (install catalog first, then the project's registered customs) to the canonical
        // name at a full version, snapshotting the build's artifact refs — the environment stays
        // self-contained whatever happens to the registry later.
        const catalog = await this.applicationCatalogLoader.loadFor(projectId);
        const applications = ApplicationList.create({
            applications: params.applications.map((requested) => catalog.resolve(
                platform.name,
                RequestedApplication.create({ name: requested.nameAlias, version: requested.versionAlias }),
            )),
        });

        // The binding's quota is enforced right here, synchronously: a request past the limit gets an
        // immediate 429, not an asynchronous `failed` from the worker.
        const quota = EnvironmentQuota.fromBindingConfig(binding.config, this.quotaPolicy);

        const environment = await this.environmentRepository.create(
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

        // A substrate of finite, known capacity (a machine pool) takes the environment's seat right
        // here, or refuses with RESOURCE_EXHAUSTED — and an environment nothing can seat is not created.
        try {
            await this.environmentProviderGateway.reserve(environment, cloudAccount);
        } catch (error) {
            await this.environmentRepository.delete(EnvironmentId.fromString(environment.id));
            throw error;
        }

        return environment;
    }

    // Where the environment runs — always a decision the caller can account for. Naming a cloud picks it
    // (a cloud runs a substrate one way, so the cloud names the binding); naming none is only allowed
    // while exactly one cloud serves the substrate, because then there is no choice to make silently.
    // With several, the request must say which, and the refusal lists them.
    private placement(
        clouds: CloudAccountList,
        params: CreateEnvironmentInput["params"],
        execution: Execution,
        projectId: ProjectId,
    ): Placement {
        if (params.cloudAccountId !== undefined) {
            const named = clouds.on(params.cloudAccountId, params.platform.name, execution);

            if (!named) {
                throw new CloudDoesNotServeError(params.cloudAccountId, params.platform.name, execution);
            }

            return named;
        }

        const candidates = clouds.candidatesFor(params.platform.name, execution);

        if (candidates.length === 0) {
            throw new NoActiveCloudAccountError(projectId.getValue());
        }

        if (candidates.length > 1) {
            throw new AmbiguousPlacementError(
                params.platform.name,
                execution,
                candidates.map(({ cloudAccount }) => ({
                    type: cloudAccount.type,
                    id: cloudAccount.resourceId ?? cloudAccount.id,
                })),
            );
        }

        return candidates[0];
    }
}
