import { Injectable } from "@nestjs/common";

import { Account } from "../../../domain/entities/account/account";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccessControl } from "../../services/access-control";

type ListAccountsInput = {
    creds: {
        token: string;
    },
}

@Injectable()
export class ListAccountsUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds }: ListAccountsInput): Promise<Array<Account>> {
        const user = await this.accessControl.authenticate(creds);

        return this.accountRepository.listByUser(user);
    }
}
