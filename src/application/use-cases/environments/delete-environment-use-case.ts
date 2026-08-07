import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { AccessControl } from "../../services/access-control";

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
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds, params }: DeleteEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const environmentId = EnvironmentId.fromString(params.environmentId);
        const environment = await this.environmentRepository.get(environmentId);
        const account = await this.accountRepository.get(environment.accountId);

        await this.accessControl.authorize(user, account, this.permissionName);

        environment.startDeletion();
        await this.environmentRepository.save(environment);

        return environment;
    }
}
