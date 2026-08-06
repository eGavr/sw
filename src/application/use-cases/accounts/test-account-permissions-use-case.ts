import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { UserCredentials } from "../../../domain/entities/user/user-credentials";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../../infrastructure/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../infrastructure/repositories/account-user-permission-repository";
import { UserRepository } from "../../../infrastructure/repositories/user-repository";

type TestAccountPermissionsInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
        permissions: ReadonlyArray<string>;
    }
}

// google.iam.v1 TestIamPermissions: returns the subset of the requested permissions that the
// caller holds on the account. Any authenticated caller may test their own permissions, so no
// permission is required to call it. A non-existent account yields an empty set (not NOT_FOUND).
@Injectable()
export class TestAccountPermissionsUseCase {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: TestAccountPermissionsInput): Promise<Array<UserPermissionName>> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const requested = params.permissions.map((permission) => UserPermissionName.fromString(permission));

        const account = await this.accountRepository.find(AccountId.fromString(params.accountId));

        if (!account) {
            return [];
        }

        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        return permissions.intersect(requested);
    }
}
