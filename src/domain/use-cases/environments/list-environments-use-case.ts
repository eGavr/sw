import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../data/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { AccountId } from "../../entities/account/account-id";
import { Environment } from "../../entities/environment/environment";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserCredentials } from "../../entities/user/user-credentials";
import { UserPermissionName } from "../../entities/user/user-permission-name";

type ListEnvironmentsInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
    },
}

@Injectable()
export class ListEnvironmentsUseCase {
    private readonly permissionName = UserPermissionName.Environment.Read;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds, params }: ListEnvironmentsInput): Promise<Array<Environment>> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const accountId = AccountId.fromString(params.accountId);
        const account = await this.accountRepository.get(accountId);
        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return this.environmentRepository.listByAccount(accountId);
    }
}
