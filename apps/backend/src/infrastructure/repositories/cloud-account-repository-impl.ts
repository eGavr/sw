import { Injectable } from "@nestjs/common";

import { CloudAccountRepository } from "../../application/interfaces/repositories/cloud-account-repository";
import { CloudAccount } from "../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../domain/entities/cloud-account/cloud-account-id";
import { NotFoundResourceError } from "../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../domain/entities/project/project-id";
import { CloudAccountDataSource } from "../data-sources/database/postgres/cloud-account-data-source";

@Injectable()
export class CloudAccountRepositoryImpl extends CloudAccountRepository {
    constructor(private readonly cloudAccountDataSource: CloudAccountDataSource) {
        super();
    }

    async get(cloudAccountId: CloudAccountId): Promise<CloudAccount> {
        const data = await this.cloudAccountDataSource.findOne(cloudAccountId.getValue());

        if (!data) {
            throw new NotFoundResourceError(cloudAccountId.getValue());
        }

        return CloudAccount.fromObject(data);
    }

    async listByProject(projectId: ProjectId): Promise<Array<CloudAccount>> {
        const data = await this.cloudAccountDataSource.listByProject(projectId.getValue());

        return data.map(CloudAccount.fromObject);
    }

    async save(cloudAccount: CloudAccount): Promise<void> {
        await this.cloudAccountDataSource.save(cloudAccount);
    }

    async delete(cloudAccountId: CloudAccountId): Promise<void> {
        await this.cloudAccountDataSource.delete(cloudAccountId.getValue());
    }
}
