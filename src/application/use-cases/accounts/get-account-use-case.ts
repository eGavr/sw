import { Injectable } from "@nestjs/common";

import { Account } from "../../../domain/entities/account/account";
import { AccountId } from "../../../domain/entities/account/account-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccessControl } from "../../services/access-control";

type GetAccountInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
    }
}

@Injectable()
export class GetAccountUseCase {
    private readonly permissionName = UserPermissionName.Account.Read;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: GetAccountInput): Promise<Account> {
        const user = await this.accessControl.authenticate(creds);
        const account = await this.accountRepository.get(AccountId.fromString(params.accountId));

        await this.accessControl.authorize(user, account, this.permissionName);

        return account;
    }
}
