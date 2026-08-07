import { Injectable } from "@nestjs/common";
import { DataSource, EntityManager, In } from "typeorm";

import { Account as AccountEntity, AccountData, IamBindingData } from "../../../../domain/entities/account/account";

import { Account } from "./typeorm/entities/account/account";
import { AccountIamBinding } from "./typeorm/entities/account/account-iam-binding";
import { User } from "./typeorm/entities/user/user";

type FindOneAccountParams = {
    id: string;
}

@Injectable()
export class AccountDataSource {
    constructor(private readonly dataSource: DataSource) {}

    async findOne(params: FindOneAccountParams): Promise<AccountData | null> {
        const account = await this.dataSource.getRepository(Account).findOne({ where: params });

        if (!account) {
            return null;
        }

        const bindings = await this.bindingsByAccount([account.id]);

        return this.toAccountData(account, bindings.get(account.id) ?? []);
    }

    async findAllByMember(member: string): Promise<Array<AccountData>> {
        const rows = await this.dataSource.getRepository(AccountIamBinding).find({ where: { member } });
        const ids = [...new Set(rows.map((row) => row.accountId))];

        if (ids.length === 0) {
            return [];
        }

        const accounts = await this.dataSource.getRepository(Account).find({ where: { id: In(ids) } });
        const bindings = await this.bindingsByAccount(ids);

        return accounts.map((account) => this.toAccountData(account, bindings.get(account.id) ?? []));
    }

    async saveOne(account: AccountEntity): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            await manager.getRepository(User).upsert(User.from(account.createdBy), ["id"]);
            await manager.getRepository(Account).save(Account.from(account));
            await this.replaceBindings(manager, account);
        });
    }

    private async replaceBindings(manager: EntityManager, account: AccountEntity): Promise<void> {
        await manager.getRepository(AccountIamBinding).delete({ accountId: account.id });

        const rows = account.iamPolicy().toBindings().flatMap((binding) => binding.memberValues().map((member) =>
            AccountIamBinding.make(account.id, binding.role, member, account.createdAt, account.updatedAt)));

        if (rows.length > 0) {
            await manager.getRepository(AccountIamBinding).save(rows);
        }
    }

    // Group the flat (role, member) rows of the given accounts back into `{role, members[]}` bindings.
    private async bindingsByAccount(accountIds: Array<string>): Promise<Map<string, Array<IamBindingData>>> {
        const rows = await this.dataSource.getRepository(AccountIamBinding).find({ where: { accountId: In(accountIds) } });
        const grouped = new Map<string, Map<string, Array<string>>>();

        for (const row of rows) {
            const roles = grouped.get(row.accountId) ?? new Map<string, Array<string>>();
            roles.set(row.role, [...(roles.get(row.role) ?? []), row.member]);
            grouped.set(row.accountId, roles);
        }

        const result = new Map<string, Array<IamBindingData>>();

        for (const [accountId, roles] of grouped) {
            result.set(accountId, [...roles].map(([role, members]) => ({ role, members })));
        }

        return result;
    }

    private toAccountData(account: Account, bindings: Array<IamBindingData>): AccountData {
        return {
            id: account.id,
            name: account.name,
            createdAt: account.createdAt,
            createdBy: {
                id: account.createdBy.id,
                externalId: account.createdBy.externalId,
                providerType: account.createdBy.providerType,
                createdAt: account.createdBy.createdAt,
                updatedAt: account.createdBy.updatedAt,
            },
            updatedAt: account.updatedAt,
            bindings,
        };
    }
}
