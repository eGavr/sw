import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { PermissionRepository } from "../../../data/repositories/permission-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { AccountId } from "../../entities/account/account-id";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { PermissionList } from "../../entities/permission/permission-list";
import { PermissionName } from "../../entities/permission/permission-name";
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
    private readonly permissionName = PermissionName.Account.Read;

    constructor(
        private readonly userRepository: UserRepository,
        private readonly permissionRepository: PermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: ListAccountPermissionsInput): Promise<PermissionList> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });
        if (!user) {
            throw new UnauthenticatedError();
        }

        const account = await this.accountRepository.get(AccountId.fromString(params.accountId));
        const permissions = await this.permissionRepository.findAll({ filter: { user, account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        return permissions;
    }
}
