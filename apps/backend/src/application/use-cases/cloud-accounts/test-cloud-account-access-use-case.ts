import { Injectable } from "@nestjs/common";

import { CloudAccountId } from "../../../domain/entities/cloud-account/cloud-account-id";
import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { EnvironmentProviderGateway } from "../../interfaces/gateways/environment-provider-gateway";
import { CloudAccountRepository } from "../../interfaces/repositories/cloud-account-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type TestCloudAccountAccessInput = {
    creds: {
        token: string;
    };
    params: {
        projectId: string;
        cloudAccountId: string;
    };
};

export type CloudAccountAccessProbe = {
    readonly ok: boolean;
    readonly message?: string;
};

// Reports whether the connected cloud is usable with its current settings — the compute gateway probes it
// under our identity (for a delegated cloud, whether the user has granted us access). Never throws on an
// access failure: an unreachable cloud is the expected answer, returned as { ok: false, message }.
@Injectable()
export class TestCloudAccountAccessUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly cloudAccountRepository: CloudAccountRepository,
        private readonly environmentProviderGateway: EnvironmentProviderGateway,
    ) {}

    async execute({ creds, params }: TestCloudAccountAccessInput): Promise<CloudAccountAccessProbe> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const cloudAccount = await this.cloudAccountRepository.get(CloudAccountId.fromString(params.cloudAccountId));

        // A cloud account of another project is not addressable here — don't leak its existence.
        if (!cloudAccount.belongsTo(ProjectId.fromString(project.id))) {
            throw new NotFoundResourceError(params.cloudAccountId);
        }

        const reachability = await this.environmentProviderGateway.checkAccess(cloudAccount);

        return { ok: reachability.reachable, message: reachability.detail };
    }
}
