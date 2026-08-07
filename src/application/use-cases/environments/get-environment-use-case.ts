import { Injectable } from "@nestjs/common";

import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { AccessControl } from "../../services/access-control";

type GetEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        environmentId: string;
    },
}

@Injectable()
export class GetEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Read;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: GetEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const environment = await this.environmentRepository.get(EnvironmentId.fromString(params.environmentId));
        const account = await this.accountRepository.get(environment.accountId);

        await this.accessControl.authorize(user, account, this.permissionName);

        return environment;
    }
}
