import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import {
    NetBridgeCredential as NetBridgeCredentialEntity,
    NetBridgeCredentialData,
} from "../../../../domain/entities/net-bridge-credential/net-bridge-credential";

import { NetBridgeCredential } from "./typeorm/entities/net-bridge-credential/net-bridge-credential";

@Injectable()
export class NetBridgeCredentialDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async save(credential: NetBridgeCredentialEntity): Promise<void> {
        await this.dataSource.getRepository(NetBridgeCredential).save(NetBridgeCredential.from(credential));
    }

    async findOne(id: string): Promise<NetBridgeCredentialData | null> {
        const row = await this.dataSource.getRepository(NetBridgeCredential).findOne({ where: { id } });

        return row?.toObject() ?? null;
    }

    async listByProject(projectId: string): Promise<Array<NetBridgeCredentialData>> {
        const rows = await this.dataSource.getRepository(NetBridgeCredential).find({ where: { projectId } });

        return rows.map((row) => row.toObject());
    }

    async delete(id: string): Promise<void> {
        await this.dataSource.getRepository(NetBridgeCredential).delete({ id });
    }
}
