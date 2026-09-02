import { Injectable } from "@nestjs/common";

import { CloudAccount, CloudConfig } from "../../../domain/entities/cloud-account/cloud-account";
import { CloudAccountList } from "../../../domain/entities/cloud-account/cloud-account-list";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
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
        config?: CloudConfig;
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

        if (!this.cloudCatalog.supports(params.type)) {
            throw new InvalidArgumentError(
                `cloud type: ${params.type}: unknown (supported: ${this.cloudCatalog.types().join(", ")})`,
            );
        }

        // A delegated cloud must name where to provision (the user's folder); silently falling back to
        // the install default would run the user's environments at the operator's cost.
        const missing = this.cloudCatalog.connectRequirementsFor(params.type).requiredConfig
            .filter((key) => typeof params.config?.[key] !== "string" || params.config[key] === "");

        if (missing.length > 0) {
            throw new InvalidArgumentError(`cloud type: ${params.type}: config requires: ${missing.join(", ")}`);
        }

        const projectId = ProjectId.fromString(project.id);
        const cloudAccount = CloudAccount.create({ projectId, type: params.type, config: params.config });

        this.autoBind(cloudAccount, CloudAccountList.of(await this.cloudAccountRepository.listByProject(projectId)));

        await this.cloudAccountRepository.save(cloudAccount);

        return cloudAccount;
    }

    // Substrates with exactly one configless kind have nothing to ask the user — bind them right away
    // (local's docker, yandex's android VM). Substrates already bound elsewhere in the project are
    // skipped: routing stays unambiguous and connect does not fail over an implicit binding.
    private autoBind(cloudAccount: CloudAccount, connected: CloudAccountList): void {
        for (const offer of this.cloudCatalog.substrateOffers(cloudAccount.type)) {
            const [sole] = offer.compute;
            const autoBindable = offer.compute.length === 1 && sole.requiredConfig.length === 0;

            if (!autoBindable || connected.isBound(offer.stereotype.platformName, offer.stereotype.execution)) {
                continue;
            }

            cloudAccount.bindCompute({
                platformName: offer.stereotype.platformName,
                execution: offer.stereotype.execution,
                kind: sole.kind,
            });
        }
    }
}
