import { Injectable } from "@nestjs/common";

import { Account, CreateAccountParams } from "../../domain/entities/account/account";

@Injectable()
export class AccountRepository {
    async create(params: CreateAccountParams): Promise<Account> {
        return Account.create(params);
    }

    async save(account: Account): Promise<Account> {
        return account;
    }
}
