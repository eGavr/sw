import { Injectable } from "@nestjs/common";

import {
    NetBridgeCredential,
} from "../../../domain/entities/net-bridge-credential/net-bridge-credential";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    NetBridgeCredentialRepository,
} from "../../interfaces/repositories/net-bridge-credential-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type ListNetBridgeCredentialsInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
    },
}

@Injectable()
export class ListNetBridgeCredentialsUseCase {
    private readonly permissionName = UserPermissionName.NetBridgeCredential.List;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly netBridgeCredentialRepository: NetBridgeCredentialRepository,
    ) {}

    async execute({ creds, params }: ListNetBridgeCredentialsInput): Promise<Array<NetBridgeCredential>> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        return this.netBridgeCredentialRepository.listByProject(ProjectId.fromString(project.id));
    }
}
