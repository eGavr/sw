import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { UserPermissionRepository } from "../../../data/repositories/user-permission-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { AccountId } from "../../entities/account/account-id";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { UserPermissionList } from "../../entities/user/user-permission-list";
import { UserPermissionName } from "../../entities/user/user-permission-name";
import { UserCredentials } from "../../entities/user/user-credentials";

type ListAccountPermissionsInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
    }
}

@Injectable()
export class ListAccountPermissionsUseCase {
    private readonly permissionName = UserPermissionName.Account.Read;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly userPermissionRepository: UserPermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: ListAccountPermissionsInput): Promise<UserPermissionList> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });
        if (!user) {
            throw new UnauthenticatedError();
        }

        const account = await this.accountRepository.get(AccountId.fromString(params.accountId));
        const permissions = await this.userPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return permissions;
    }
}
