import { Injectable } from "@nestjs/common";

import { Account } from "../../../domain/entities/account/account";
import { AccountId } from "../../../domain/entities/account/account-id";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { UserCredentials } from "../../../domain/entities/user/user-credentials";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { ProviderAccountRepository } from "../../interfaces/repositories/provider-account-repository";
import { UserRepository } from "../../interfaces/repositories/user-repository";

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

@Injectable()
export class CreateAccountUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountRepository: AccountRepository,
        private readonly providerAccountRepository: ProviderAccountRepository,
    ) {}

    async execute({ creds, params }: CreateAccountInput): Promise<Account> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        // Self-service: any authenticated user may create an account and becomes its owner with all
        // permissions (granted inside Account.create and persisted by save). No prior permission is
        // required — that was the bootstrap deadlock (needing Account.Create before any account exists).
        const account = await this.accountRepository.create({ name: params.name, createdBy: user });
        await this.accountRepository.save(account);

        await this.providerAccountRepository.create({
            accountId: AccountId.fromString(account.id),
            providerType: params.resources.providerType,
            externalRef: params.resources.providerId,
        });

        return account;
    }
}
