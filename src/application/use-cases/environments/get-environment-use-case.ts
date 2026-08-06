import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { PermissionDeniedError } from "../../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { UserCredentials } from "../../../domain/entities/user/user-credentials";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../interfaces/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { UserRepository } from "../../interfaces/repositories/user-repository";

type GetEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        environmentId: string;
    },
}

type GetEnvironmentResult = Environment;

@Injectable()
export class GetEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Read;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: GetEnvironmentInput): Promise<GetEnvironmentResult> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const account = await this.accountRepository.get(environment.accountId);
        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.has(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return environment;
    }
}
