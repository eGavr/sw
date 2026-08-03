import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { Account } from "../../entities/account/account";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserCredentials } from "../../entities/user/user-credentials";

type ListAccountsInput = {
    creds: {
        token: string;
    },
}

@Injectable()
export class ListAccountsUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds }: ListAccountsInput): Promise<Array<Account>> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        return this.accountRepository.listByUser(user);
    }
}
