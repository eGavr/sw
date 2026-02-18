import { Injectable } from "@nestjs/common";

import { Account, CreateAccountParams } from "../../domain/entities/account/account";
import { AccountId } from "../../domain/entities/account/account-id";
import { NotFoundResourceError } from "../../domain/entities/error/not-found/not-found-resource-error";
import { AccountDataSource } from "../data-sources/database/postgres/account-data-source";

@Injectable()
export class AccountRepository {
    constructor(private readonly accountDataSource: AccountDataSource) {}

    async get(accountId: AccountId): Promise<Account> {
        const data = await this.accountDataSource.findOne({ id: accountId.getValue() });

        if (!data) {
            throw new NotFoundResourceError(accountId.getValue())
        }

        return Account.fromObject(data);
    }

    async create(params: CreateAccountParams): Promise<Account> {
        return Account.create(params);
    }

    async save(account: Account): Promise<Account> {
        await this.accountDataSource.saveOne(account);

        return account;
    }
}
