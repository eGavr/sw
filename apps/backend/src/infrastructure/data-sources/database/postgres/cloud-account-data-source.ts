import { Injectable } from "@nestjs/common";
import { DataSource, QueryFailedError } from "typeorm";

import {
    CloudAccount as CloudAccountEntity,
    CloudAccountData,
} from "../../../../domain/entities/cloud-account/cloud-account";
import {
    CloudAccountInUseError,
} from "../../../../domain/entities/cloud-account/error/cloud-account-in-use-error";

import { CloudAccount } from "./typeorm/entities/cloud-account/cloud-account";
import { ComputeBinding } from "./typeorm/entities/cloud-account/compute-binding";

const foreignKeyViolation = "23503";

@Injectable()
export class CloudAccountDataSource {
    constructor(private readonly dataSource: DataSource) {}

    // The aggregate and its owned bindings persist together: parent row, binding upserts, then removal of
    // bindings the aggregate no longer holds — one transaction, or a partial write could strand a binding.
    async save(cloudAccount: CloudAccountEntity): Promise<void> {
        const entity = CloudAccount.from(cloudAccount);

        await this.dataSource.transaction(async (manager) => {
            const { computeBindings, ...row } = entity;

            await manager.getRepository(CloudAccount).save(row);
            await manager.getRepository(ComputeBinding).save(computeBindings);

            const kept = computeBindings.map((binding) => binding.id);
            const stale = await manager.getRepository(ComputeBinding).find({
                where: { cloudAccountId: entity.id },
            });

            await manager.getRepository(ComputeBinding).remove(
                stale.filter((binding) => !kept.includes(binding.id)),
            );
        });
    }

    async findOne(id: string): Promise<CloudAccountData | null> {
        const cloudAccount = await this.dataSource.getRepository(CloudAccount).findOne({ where: { id } });

        return cloudAccount?.toObject() ?? null;
    }

    // Either address answers: the word the connection was named with, or its uid. Kept as one query so
    // a caller never has to know which form it holds.
    async findByProjectAndHandle(projectId: string, handle: string): Promise<CloudAccountData | null> {
        const cloudAccount = await this.dataSource.getRepository(CloudAccount)
            .createQueryBuilder("account")
            .leftJoinAndSelect("account.computeBindings", "binding")
            .where("account.projectId = :projectId", { projectId })
            .andWhere("(account.resourceId = :handle OR account.id::text = :handle)", { handle })
            .getOne();

        return cloudAccount?.toObject() ?? null;
    }

    async listByProject(projectId: string): Promise<Array<CloudAccountData>> {
        const cloudAccounts = await this.dataSource.getRepository(CloudAccount).find({ where: { projectId } });

        return cloudAccounts.map((cloudAccount) => cloudAccount.toObject());
    }

    // The environment -> cloud_account FK arbitrates the delete-vs-reference race: a check-then-delete
    // would miss an environment created in between, the constraint cannot.
    async delete(id: string): Promise<void> {
        try {
            await this.dataSource.getRepository(CloudAccount).delete({ id });
        } catch (error) {
            if (error instanceof QueryFailedError && error.driverError?.code === foreignKeyViolation) {
                throw new CloudAccountInUseError(id);
            }

            throw error;
        }
    }
}
