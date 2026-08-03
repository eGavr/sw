import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { UserPermissionRepository } from "../../../data/repositories/user-permission-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { Account } from "../../entities/account/account";
import { AccountId } from "../../entities/account/account-id";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserCredentials } from "../../entities/user/user-credentials";
import { UserPermissionName } from "../../entities/user/user-permission-name";

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
        private readonly userRepository: UserRepository,
        private readonly userPermissionRepository: UserPermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: GetAccountInput): Promise<Account> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const account = await this.accountRepository.get(AccountId.fromString(params.accountId));
        const permissions = await this.userPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return account;
    }
}
