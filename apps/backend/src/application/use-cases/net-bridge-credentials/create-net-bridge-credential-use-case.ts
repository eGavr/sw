import { Injectable } from "@nestjs/common";

import {
    IssuedNetBridgeCredential,
    NetBridgeCredential,
} from "../../../domain/entities/net-bridge-credential/net-bridge-credential";
import { NetBridgeSecret } from "../../../domain/entities/net-bridge-credential/net-bridge-secret";
import { ProjectId } from "../../../domain/entities/project/project-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import {
    NetBridgeCredentialRepository,
} from "../../interfaces/repositories/net-bridge-credential-repository";
import { ProjectRepository } from "../../interfaces/repositories/project-repository";
import { AccessControl } from "../../services/access-control";

type CreateNetBridgeCredentialInput = {
    creds: {
        token: string;
    },
    params: {
        projectId: string;
        name?: string | null;
        expiresAt?: Date | null;
    },
}

@Injectable()
export class CreateNetBridgeCredentialUseCase {
    private readonly permissionName = UserPermissionName.NetBridgeCredential.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly projectRepository: ProjectRepository,
        private readonly netBridgeCredentialRepository: NetBridgeCredentialRepository,
    ) {}

    async execute({ creds, params }: CreateNetBridgeCredentialInput): Promise<IssuedNetBridgeCredential> {
        const user = await this.accessControl.authenticate(creds);
        const project = await this.projectRepository.getByHandle(params.projectId);

        await this.accessControl.authorize(user, project, this.permissionName);

        const secret = NetBridgeSecret.generate();
        const credential = NetBridgeCredential.create({
            projectId: ProjectId.fromString(project.id),
            name: params.name ?? null,
            secret,
            expiresAt: params.expiresAt ?? null,
        });

        await this.netBridgeCredentialRepository.save(credential);

        return { credential, secret };
    }
}
