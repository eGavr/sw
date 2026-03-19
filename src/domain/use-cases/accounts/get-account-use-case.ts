import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { UserPermissionRepository } from "../../../data/repositories/user-permission-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { Account } from "../../entities/account/account";
import { AccountId } from "../../entities/account/account-id";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserPermissionName } from "../../entities/user/user-permission-name";
import { UserCredentials } from "../../entities/user/user-credentials";

type GetAccountInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
    }
}

type GetAccountResult = Account;

@Injectable()
export class GetAccountUseCase {
    private readonly permissionName = UserPermissionName.Account.Read;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly userPermissionRepository: UserPermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: GetAccountInput): Promise<GetAccountResult> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        return this.accountRepository.get(AccountId.fromString(params.accountId));
    }
}
