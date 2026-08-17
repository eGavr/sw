import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { Application } from "../../../domain/entities/environment/application/application";
import { ApplicationList } from "../../../domain/entities/environment/application/application-list";
import { Environment } from "../../../domain/entities/environment/environment";
import { defaultExecution, toExecution } from "../../../domain/entities/environment/execution";
import { Platform } from "../../../domain/entities/environment/platform/platform";
import { NoActiveProviderAccountError } from "../../../domain/entities/provider-account/error/no-active-provider-account-error";
import { ProviderAccountId } from "../../../domain/entities/provider-account/provider-account-id";
import { ProviderAccountList } from "../../../domain/entities/provider-account/provider-account-list";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

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
        execution?: string;
        applications: Array<{
            name: string;
            version: string;
        }>;
    },
}

@Injectable()
export class CreateEnvironmentUseCase {
    private readonly permissionName = UserPermissionName.Environment.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: CreateEnvironmentInput): Promise<Environment> {
        const user = await this.accessControl.authenticate(creds);
        const accountId = AccountId.fromString(params.accountId);
        const account = await this.accountRepository.get(accountId);

        await this.accessControl.authorize(user, account, this.permissionName);

        const execution = params.execution ? toExecution(params.execution) : defaultExecution;
        const providerAccounts = await this.providerAccountRepository.listActiveByAccount(accountId);
        const providerAccount = ProviderAccountList.of(providerAccounts).resolveFor(params.platform.name, execution);

        if (!providerAccount) {
            throw new NoActiveProviderAccountError(accountId.getValue());
        }

        const applications = ApplicationList.create({
            applications: params.applications.map((application) => Application.create(application)),
        });

        return this.environmentRepository.create({
            accountId,
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
            provider: providerAccount.provider,
            platform: Platform.fromObject(params.platform),
            execution,
            applications,
        });
    }
}
