import { Injectable } from "@nestjs/common";

import { PermissionDeniedError } from "../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../domain/entities/error/unauthenticated-error";
import { Member } from "../../domain/entities/project/iam/member";
import { Project } from "../../domain/entities/project/project";
import { User } from "../../domain/entities/user/user";
import { UserCredentials } from "../../domain/entities/user/user-credentials";
import { UserPermissionName } from "../../domain/entities/user/user-permission-name";
import { UserRepository } from "../interfaces/repositories/user-repository";

export type Credentials = {
    readonly token: string;
};

// Application-layer access control (authN + our authZ). Injected into use cases so identity and
// permission checks live in one place instead of being copy-pasted. The use case still resolves which
// project it acts on (that differs per scenario) and asks to authorize against it. Authorization is our
// business logic, so it stays in the application layer — not the transport. The project carries its IAM
// policy, so the check resolves the member's roles to permissions in the domain, without an extra read.
@Injectable()
export class AccessControl {
    constructor(private readonly userRepository: UserRepository) {}

    async authenticate(credentials: Credentials): Promise<User> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(credentials) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        return user;
    }

    async authorize(user: User, project: Project, permission: UserPermissionName): Promise<void> {
        if (!project.grants(this.principalsOf(user), permission)) {
            throw new PermissionDeniedError(`user: no permission: ${permission}`);
        }
    }

    // The IAM principals a caller presents: their own user identity plus every group the IdP asserts for
    // them. Effective access is resolved against all of them (union), so a role granted to a group reaches
    // its members without us storing any membership.
    principalsOf(user: User): Array<Member> {
        return [Member.user(user.externalId), ...user.groups.map((group) => Member.group(group))];
    }
}
