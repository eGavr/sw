import { Injectable } from "@nestjs/common";

import { CloudAccountRepository } from "../../application/interfaces/repositories/cloud-account-repository";
import { CloudAccount, CloudAccountCreateParams } from "../../domain/entities/cloud-account/cloud-account";
import { CloudAccountId } from "../../domain/entities/cloud-account/cloud-account-id";
import { CloudAccountState } from "../../domain/entities/cloud-account/cloud-account-state";
import { NotFoundResourceError } from "../../domain/entities/error/not-found/not-found-resource-error";
import { ProjectId } from "../../domain/entities/project/project-id";
import { CloudAccountDataSource } from "../data-sources/database/postgres/cloud-account-data-source";

@Injectable()
export class CloudAccountRepositoryImpl extends CloudAccountRepository {
    constructor(private readonly cloudAccountDataSource: CloudAccountDataSource) {
        super();
    }

    async create(params: CloudAccountCreateParams): Promise<CloudAccount> {
        const cloudAccount = CloudAccount.create(params);

        await this.cloudAccountDataSource.create(cloudAccount);

        return cloudAccount;
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

    async listActiveByProject(projectId: ProjectId): Promise<Array<CloudAccount>> {
        const data = await this.cloudAccountDataSource.listByProjectAndState(
            projectId.getValue(),
            CloudAccountState.Active,
        );

        return data.map(CloudAccount.fromObject);
    }

    async save(cloudAccount: CloudAccount): Promise<void> {
        await this.cloudAccountDataSource.save(cloudAccount);
    }
}
