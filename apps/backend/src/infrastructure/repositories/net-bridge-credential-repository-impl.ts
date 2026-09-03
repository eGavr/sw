import { Injectable } from "@nestjs/common";

import {
    NetBridgeCredentialRepository,
} from "../../application/interfaces/repositories/net-bridge-credential-repository";
import { NotFoundResourceError } from "../../domain/entities/error/not-found/not-found-resource-error";
import {
    NetBridgeCredential,
} from "../../domain/entities/net-bridge-credential/net-bridge-credential";
import {
    NetBridgeCredentialId,
} from "../../domain/entities/net-bridge-credential/net-bridge-credential-id";
import { ProjectId } from "../../domain/entities/project/project-id";
import {
    NetBridgeCredentialDataSource,
} from "../data-sources/database/postgres/net-bridge-credential-data-source";

@Injectable()
export class NetBridgeCredentialRepositoryImpl extends NetBridgeCredentialRepository {
    constructor(private readonly netBridgeCredentialDataSource: NetBridgeCredentialDataSource) {
        super();
    }

    async get(id: NetBridgeCredentialId): Promise<NetBridgeCredential> {
        const data = await this.netBridgeCredentialDataSource.findOne(id.getValue());

        if (!data) {
            throw new NotFoundResourceError(id.getValue());
        }

        return NetBridgeCredential.fromObject(data);
    }

    async findBySecretHash(secretHash: string): Promise<NetBridgeCredential | null> {
        const data = await this.netBridgeCredentialDataSource.findBySecretHash(secretHash);

        return data ? NetBridgeCredential.fromObject(data) : null;
    }

    async listByProject(projectId: ProjectId): Promise<Array<NetBridgeCredential>> {
        const data = await this.netBridgeCredentialDataSource.listByProject(projectId.getValue());

        return data.map(NetBridgeCredential.fromObject);
    }

    async save(credential: NetBridgeCredential): Promise<void> {
        await this.netBridgeCredentialDataSource.save(credential);
    }

    async delete(id: NetBridgeCredentialId): Promise<void> {
        await this.netBridgeCredentialDataSource.delete(id.getValue());
    }
}
