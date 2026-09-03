import { Injectable } from "@nestjs/common";

import { NotFoundResourceError } from "../../../domain/entities/error/not-found/not-found-resource-error";
import {
    NetBridgeCredential,
} from "../../../domain/entities/net-bridge-credential/net-bridge-credential";
import {
    NetBridgeCredentialId,
} from "../../../domain/entities/net-bridge-credential/net-bridge-credential-id";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    NetBridgeCredentialRepository,
} from "../../interfaces/repositories/net-bridge-credential-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type GetNetBridgeCredentialInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        credentialId: string;
    },
}

@Injectable()
export class GetNetBridgeCredentialUseCase {
    private readonly permissionName = UserPermissionName.NetBridgeCredential.Get;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly netBridgeCredentialRepository: NetBridgeCredentialRepository,
    ) {}

    async execute({ creds, params }: GetNetBridgeCredentialInput): Promise<NetBridgeCredential> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const projectId = ProjectId.fromString(project.id);
        const credential = await this.netBridgeCredentialRepository.get(
            NetBridgeCredentialId.fromString(params.credentialId),
        );

        if (!credential.belongsTo(projectId)) {
            throw new NotFoundResourceError(params.credentialId);
        }

        return credential;
    }
}
