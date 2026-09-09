import { Injectable } from "@nestjs/common";

import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { ResourceIdConflictError } from "../../../domain/entities/error/resource-id-conflict-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { ensureNotCatalogProject } from "../../../domain/entities/project-application/catalog-project";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudCatalog } from "../../interfaces/cloud-catalog";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type CreateCloudAccountInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        type: string;
        // The word this connection is addressed by afterwards; omitted = addressed by its uid.
        cloudAccountId?: string;
        // A label for people; never an address.
        displayName?: string;
    },
}

@Injectable()
export class CreateCloudAccountUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly cloudCatalog: CloudCatalog,
    ) {}

    async execute({ creds, params }: CreateCloudAccountInput): Promise<CloudAccount> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        ensureNotCatalogProject(project, "connecting clouds");

        if (!this.cloudCatalog.supports(params.type)) {
            throw new InvalidArgumentError(
                `cloud type: ${params.type}: unknown (supported: ${this.cloudCatalog.types().join(", ")})`,
            );
        }

        // The connection starts EMPTY: every platform the user wants is bound explicitly through
        // computeBindings — no implicit defaults appearing behind their back (user decision). Everything
        // the user must name or grant (folder, cluster) belongs to a binding, so connect needs only the
        // type.
        const projectId = ProjectId.fromString(project.id);

        // A chosen word must be free among the project's connections — it is how they will be addressed.
        if (params.cloudAccountId !== undefined) {
            const connected = await this.cloudAccountRepository.listByProject(projectId);

            if (connected.some((account) => account.isAddressedBy(params.cloudAccountId as string))) {
                throw new ResourceIdConflictError(params.cloudAccountId);
            }
        }

        const cloudAccount = CloudAccount.create({
            projectId,
            type: params.type,
            resourceId: params.cloudAccountId,
            displayName: params.displayName,
        });

        await this.cloudAccountRepository.save(cloudAccount);

        return cloudAccount;
    }
}
