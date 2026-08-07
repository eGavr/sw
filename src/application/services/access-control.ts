import { Injectable } from "@nestjs/common";

import { Account } from "../../domain/entities/account/account";
import { PermissionDeniedError } from "../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../domain/entities/error/unauthenticated-error";
import { User } from "../../domain/entities/user/user";
import { UserCredentials } from "../../domain/entities/user/user-credentials";
import { UserPermissionName } from "../../domain/entities/user/user-permission-name";
import { AccountUserPermissionRepository } from "../interfaces/repositories/account-user-permission-repository";
import { UserRepository } from "../interfaces/repositories/user-repository";

export type Credentials = {
    readonly token: string;
};

// Application-layer access control (authN + our authZ). Injected into use cases so identity and
// permission checks live in one place instead of being copy-pasted. The use case still resolves which
// account it acts on (that differs per scenario) and asks to authorize against it. Authorization is our
// business logic, so it stays in the application layer — not the transport.
@Injectable()
export class AccessControl {
    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
    ) {}

    async authenticate(credentials: Credentials): Promise<User> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(credentials) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        return user;
    }

    async authorize(user: User, account: Account, permission: UserPermissionName): Promise<void> {
        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.has(permission)) {
            throw new PermissionDeniedError(`user: no permission: ${permission}`);
        }
    }
}
