import { Injectable } from "@nestjs/common";

import { PlatformCatalog } from "../../../domain/entities/application-catalog/platform-catalog";
import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { CloudAccountList, Placement } from "../../../domain/entities/cloud-account/cloud-account-list";
import {
    ComputeBindingDoesNotServeError,
} from "../../../domain/entities/cloud-account/error/compute-binding-does-not-serve-error";
import { NoActiveCloudAccountError } from "../../../domain/entities/cloud-account/error/no-active-cloud-account-error";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { RequestedApplication } from "../../../domain/entities/environment/application/requested-application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { EnvironmentQuota, EnvironmentQuotaPolicy } from "../../../domain/entities/environment/environment-quota";
import { defaultExecution, Execution, toExecution } from "../../../domain/entities/environment/execution";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { ResourceExhaustedError } from "../../../domain/entities/error/resource-exhausted-error";
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
        // Pin the placement to one binding of the project (its uid). Omitted = the project's bindings
        // for this substrate are walked in order, the first one with room taking the environment.
        computeBindingId?: string;
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
        const candidates = this.placements(clouds, params, execution);

        if (candidates.length === 0) {
            throw new NoActiveCloudAccountError(projectId.getValue());
        }

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

        return this.place(candidates, {
            resourceId: params.environmentId,
            projectId,
            platform,
            execution,
            applications,
        });
    }

    // Where the environment may land, in the order it is tried: the pinned binding alone when the caller
    // named one, else every binding of the project serving this substrate, primary first.
    private placements(
        clouds: CloudAccountList,
        params: CreateEnvironmentInput["params"],
        execution: Execution,
    ): Array<Placement> {
        if (params.computeBindingId === undefined) {
            return clouds.candidatesFor(params.platform.name, execution);
        }

        const pinned = clouds.pinnedTo(params.computeBindingId, params.platform.name, execution);

        if (!pinned) {
            throw new ComputeBindingDoesNotServeError(params.computeBindingId, params.platform.name, execution);
        }

        return [pinned];
    }

    // Walk the placements until one takes the environment. A cloud is out when its quota is spent or its
    // substrate has no seat left — both are RESOURCE_EXHAUSTED, and both mean "ask the next one". The
    // refusal only reaches the caller when nowhere has room; a pinned placement is a list of one, so a
    // pin never spills onto a cloud the caller did not ask for.
    private async place(
        candidates: ReadonlyArray<Placement>,
        environmentParams: {
            resourceId?: string;
            projectId: ProjectId;
            platform: Platform;
            execution: Execution;
            applications: ApplicationList;
        },
    ): Promise<Environment> {
        let exhausted: unknown;

        for (const { cloudAccount, binding } of candidates) {
            const quota = EnvironmentQuota.fromBindingConfig(binding.config, this.quotaPolicy);
            let environment: Environment;

            try {
                environment = await this.environmentRepository.create(
                    {
                        ...environmentParams,
                        cloudAccountId: CloudAccountId.fromString(cloudAccount.id),
                        cloudType: cloudAccount.type,
                        computeKind: binding.kind,
                    },
                    quota.toClaim(cloudAccount.id, environmentParams.platform.name, environmentParams.execution),
                );
            } catch (error) {
                if (!(error instanceof ResourceExhaustedError)) {
                    throw error;
                }

                exhausted = error;
                continue;
            }

            // A substrate of finite, known capacity (a machine pool) takes the environment's seat right
            // here — and an environment nothing can seat is not left behind.
            try {
                await this.environmentProviderGateway.reserve(environment, cloudAccount);

                return environment;
            } catch (error) {
                await this.environmentRepository.delete(EnvironmentId.fromString(environment.id));

                if (!(error instanceof ResourceExhaustedError)) {
                    throw error;
                }

                exhausted = error;
            }
        }

        throw exhausted;
    }
}
