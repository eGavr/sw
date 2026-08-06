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

type DeleteEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        environmentId: string;
    },
}

@Injectable()
export class DeleteEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Delete;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds, params }: DeleteEnvironmentInput): Promise<Environment> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const environmentId = EnvironmentId.fromString(params.environmentId);
        const environment = await this.environmentRepository.get(environmentId);
        const account = await this.accountRepository.get(environment.accountId);
        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.has(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        environment.startDeletion();
        await this.environmentRepository.save(environment);

        return environment;
    }
}
