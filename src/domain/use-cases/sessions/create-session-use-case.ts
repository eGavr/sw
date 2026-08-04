import { Injectable } from "@nestjs/common";

import { AccountRepository } from "../../../data/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../data/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { SessionRepository } from "../../../data/repositories/session-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { Application } from "../../entities/environment/application/application";
import { ApplicationKind } from "../../entities/environment/application/application-kind";
import { EnvironmentId } from "../../entities/environment/environment-id";
import { ApplicationNotAvailableError } from "../../entities/environment/error/application-not-available-error";
import { EnvironmentBusyError } from "../../entities/environment/error/environment-busy-error";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../entities/error/unauthenticated-error";
import { Session } from "../../entities/session/session";
import { SessionIdleTimeout } from "../../entities/session/session-idle-timeout";
import { UserCredentials } from "../../entities/user/user-credentials";
import { UserPermissionName } from "../../entities/user/user-permission-name";

type CreateSessionInput = {
    creds: {
        token: string;
    },
    params: {
        environmentId: string;
        application: {
            name: string;
            version: string;
            kind?: string;
        };
    },
}

@Injectable()
export class CreateSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Create;

    // FIXME: source the session idle timeout from configuration.
    private readonly idleTimeout = SessionIdleTimeout.fromMilliseconds(60_000);

    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionRepository: SessionRepository,
    ) {}

    async execute({ creds, params }: CreateSessionInput): Promise<Session> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const environmentId = EnvironmentId.fromString(params.environmentId);
        const environment = await this.environmentRepository.get(environmentId);
        const account = await this.accountRepository.get(environment.accountId);
        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.find(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        const application = Application.fromObject({
            name: params.application.name,
            version: params.application.version,
            kind: params.application.kind ?? ApplicationKind.Browser,
        });

        if (!environment.supports(application)) {
            throw new ApplicationNotAvailableError(application.name, application.version);
        }

        const active = await this.sessionRepository.listByEnvironment(environmentId);

        if (active.length > 0) {
            throw new EnvironmentBusyError(environment.id);
        }

        return this.sessionRepository.create(Session.create({
            environmentId,
            application,
            idleTimeout: this.idleTimeout,
            now: new Date(),
        }));
    }
}
