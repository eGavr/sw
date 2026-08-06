import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { Environment } from "../../../domain/entities/environment/environment";
import { PermissionDeniedError } from "../../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { UserCredentials } from "../../../domain/entities/user/user-credentials";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../interfaces/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { UserRepository } from "../../interfaces/repositories/user-repository";

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

        if (!permissions.has(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return this.environmentRepository.listByAccount(accountId);
    }
}
