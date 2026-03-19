import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { UserPermissionRepository } from "../../../data/repositories/user-permission-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { Account } from "../../entities/account/account";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserPermissionName } from "../../entities/user/user-permission-name";
import { UserCredentials } from "../../entities/user/user-credentials";

type CreateAccountInput = {
    creds: {
        token: string;
    },
    params: {
        name: string;
        resources: {
            providerId: string;
            providerType: string;
        }
    }
}

type CreateAccountResult = Account;

@Injectable()
export class CreateAccountUseCase {
    private readonly permissionName = UserPermissionName.Account.Create;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly userPermissionRepository: UserPermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: CreateAccountInput): Promise<CreateAccountResult> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });
        if (!user) {
            throw new UnauthenticatedError();
        }

        const account = await this.accountRepository.create({ ...params, createdBy: user });
        const permissions = await this.userPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return this.accountRepository.save(account);
    }
}
