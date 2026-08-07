import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../interfaces/repositories/account-user-permission-repository";
import { AccessControl } from "../../services/access-control";

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
        private readonly accessControl: AccessControl,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
    ) {}

    async execute({ creds, params }: TestAccountPermissionsInput): Promise<Array<UserPermissionName>> {
        const user = await this.accessControl.authenticate(creds);
        const requested = params.permissions.map((permission) => UserPermissionName.fromString(permission));

        const account = await this.accountRepository.find(AccountId.fromString(params.accountId));

        if (!account) {
            return [];
        }

        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        return permissions.intersect(requested);
    }
}
