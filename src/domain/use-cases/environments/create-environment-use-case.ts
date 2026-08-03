import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../data/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { AccountId } from "../../entities/account/account-id";
import { Application } from "../../entities/environment/application/application";
import { ApplicationKind } from "../../entities/environment/application/application-kind";
import { ApplicationList } from "../../entities/environment/application/application-list";
import { Environment } from "../../entities/environment/environment";
import { Platform } from "../../entities/environment/platform/platform";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserCredentials } from "../../entities/user/user-credentials";
import { UserPermissionName } from "../../entities/user/user-permission-name";

type CreateEnvironmentInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
        platform: {
            name: string;
            version: string;
            deviceModel?: string;
        };
        application: {
            name: string;
            version: string;
            kind?: string;
        };
    },
}

@Injectable()
export class CreateEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Create;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
    ) {}

    async execute({ creds, params }: CreateEnvironmentInput): Promise<Environment> {
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

        const application = Application.fromObject({
            name: params.application.name,
            version: params.application.version,
            kind: params.application.kind ?? ApplicationKind.Browser,
        });

        return this.environmentRepository.create({
            accountId,
            platform: Platform.fromObject(params.platform),
            applications: ApplicationList.create({ applications: [application] }),
        });
    }
}
