import { Injectable } from "@nestjs/common";

import { CloudAccount, CloudConfig } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountList } from "../../../domain/entities/cloud-account/cloud-account-list";
import { CloudAccountOverlapError } from "../../../domain/entities/cloud-account/error/cloud-account-overlap-error";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { CloudCatalog } from "../../interfaces/cloud-catalog";
import { SecretStore } from "../../interfaces/gateways/secret-store";
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
        config?: CloudConfig;
        // The cloud's own credentials (e.g. a service-account key) the adapter will provision with. Opaque
        // here: it goes straight to the secret store and only its reference is persisted, never the secret.
        credential?: string;
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
        private readonly secretStore: SecretStore,
    ) {}

    async execute({ creds, params }: CreateCloudAccountInput): Promise<CloudAccount> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        if (!this.cloudCatalog.supports(params.type)) {
            throw new InvalidArgumentError(
                `cloud type: ${params.type}: unknown (supported: ${this.cloudCatalog.types().join(", ")})`,
            );
        }

        const projectId = ProjectId.fromString(project.id);
        const connected = await this.cloudAccountRepository.listByProject(projectId);

        // The overlap check needs only type/provides, so run it before touching the secret store — a
        // conflict must not leave a stored secret behind.
        const provides = this.cloudCatalog.providesFor(params.type);
        const conflict = CloudAccountList.of(connected).conflictWith(
            CloudAccount.create({ projectId, type: params.type, provides }),
        );

        if (conflict) {
            throw new CloudAccountOverlapError(params.type, conflict.type);
        }

        const credentialRef = params.credential ? await this.secretStore.store(params.credential) : null;
        const cloudAccount = CloudAccount.create({
            projectId,
            type: params.type,
            provides,
            config: params.config,
            credentialRef,
        });

        await this.cloudAccountRepository.save(cloudAccount);

        return cloudAccount;
    }
}
