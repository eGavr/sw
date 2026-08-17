import { Injectable } from "@nestjs/common";

import { Account } from "../../../domain/entities/account/account";
import { AccountId } from "../../../domain/entities/account/account-id";
import { toExecution } from "../../../domain/entities/environment/execution";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { AccessControl } from "../../services/access-control";

type ComputeProvider = {
    provider: string;
    externalRef: string;
    platform: string;
    execution: string;
};

type CreateAccountInput = {
    creds: {
        token: string;
    },
    params: {
        name: string;
        compute: Array<ComputeProvider>;
    }
}

@Injectable()
export class CreateAccountUseCase {
    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: CreateAccountInput): Promise<Account> {
        const user = await this.accessControl.authenticate(creds);

        // Self-service: any authenticated user may create an account and becomes its owner with all
        // permissions (granted inside Account.create and persisted by save). No prior permission is
        // required — that was the bootstrap deadlock (needing Account.Create before any account exists).
        const account = await this.accountRepository.create({ name: params.name, createdBy: user });
        await this.accountRepository.save(account);

        const accountId = AccountId.fromString(account.id);

        for (const compute of params.compute) {
            await this.providerAccountRepository.create({
                accountId,
                provider: compute.provider,
                platformName: compute.platform,
                execution: toExecution(compute.execution),
                externalRef: compute.externalRef,
            });
        }

        return account;
    }
}
