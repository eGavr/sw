import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";

import {
    CloudAccount as CloudAccountEntity,
    CloudAccountData,
} from "../../../../domain/entities/cloud-account/cloud-account";

import { CloudAccount } from "./typeorm/entities/cloud-account/cloud-account";

@Injectable()
export class CloudAccountDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async save(cloudAccount: CloudAccountEntity): Promise<void> {
        await this.dataSource.getRepository(CloudAccount).save(CloudAccount.from(cloudAccount));
    }

    async findOne(id: string): Promise<CloudAccountData | null> {
        const cloudAccount = await this.dataSource.getRepository(CloudAccount).findOne({ where: { id } });

        return cloudAccount?.toObject() ?? null;
    }

    async listByProject(projectId: string): Promise<Array<CloudAccountData>> {
        const cloudAccounts = await this.dataSource.getRepository(CloudAccount).find({ where: { projectId } });

        return cloudAccounts.map((cloudAccount) => cloudAccount.toObject());
    }

    async listByProjectAndState(projectId: string, state: string): Promise<Array<CloudAccountData>> {
        const cloudAccounts = await this.dataSource.getRepository(CloudAccount).find({ where: { projectId, state } });

        return cloudAccounts.map((cloudAccount) => cloudAccount.toObject());
    }
}
