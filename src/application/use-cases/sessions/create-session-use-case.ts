import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { Application } from "../../../domain/entities/environment/application/application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { defaultHeartbeatFreshnessMs } from "../../../domain/entities/environment/heartbeat-freshness";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
import { PermissionDeniedError } from "../../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";
import { NoAllocatableEnvironmentError } from "../../../domain/entities/session/error/no-allocatable-environment-error";
import { Session } from "../../../domain/entities/session/session";
import { SessionIdleTimeout } from "../../../domain/entities/session/session-idle-timeout";
import { UserCredentials } from "../../../domain/entities/user/user-credentials";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { WebDriverSessionGateway } from "../../interfaces/gateways/webdriver-session-gateway";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../interfaces/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { UserRepository } from "../../interfaces/repositories/user-repository";

type CreateSessionInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
        application: {
            name: string;
            version: string;
        };
    },
}

// Pool allocation: the caller asks for an application, not a specific environment. We pick a free,
// fresh, matching environment from the account and open the session on its node. The node is the real
// 1:1 arbiter, so the DB `busy` is only a hint — we try candidates until one accepts and never write
// to the DB here (the next agent heartbeat reports the new busy state).
@Injectable()
export class CreateSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Create;
    private readonly idleTimeout = SessionIdleTimeout.default();

    constructor(
        private readonly userRepository: UserRepository,
        private readonly accountUserPermissionRepository: AccountUserPermissionRepository,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly webDriverSessionGateway: WebDriverSessionGateway,
    ) {}

    async execute({ creds, params }: CreateSessionInput): Promise<Session> {
        const user = await this.userRepository.find({ filter: { creds: UserCredentials.create(creds) } });

        if (!user) {
            throw new UnauthenticatedError();
        }

        const accountId = AccountId.fromString(params.accountId);
        const account = await this.accountRepository.get(accountId);
        const permissions = await this.accountUserPermissionRepository.findAll({ filter: { user, account } });

        if (!permissions.has(this.permissionName)) {
            throw new PermissionDeniedError(`user: no permission: ${this.permissionName}`);
        }

        const application = Application.fromObject(params.application);
        const criteria = SessionAllocationCriteria.from(new Date(), defaultHeartbeatFreshnessMs, application);
        const candidates = await this.environmentRepository.findAllocatable(accountId, criteria);

        return this.allocate(candidates, application);
    }

    private async allocate(candidates: Array<Environment>, application: Application): Promise<Session> {
        for (const candidate of candidates) {
            const session = await this.tryAllocate(candidate, application);

            if (session) {
                return session;
            }
        }

        throw new NoAllocatableEnvironmentError(application.name, application.version);
    }

    private async tryAllocate(environment: Environment, application: Application): Promise<Session | null> {
        if (!environment.endpoint) {
            return null;
        }

        try {
            const webDriverSessionId = await this.webDriverSessionGateway.create(environment.endpoint, application);

            const session = Session.create({
                environmentId: EnvironmentId.fromString(environment.id),
                application,
                idleTimeout: this.idleTimeout,
                now: new Date(),
                endpoint: environment.endpoint,
            });
            session.bindWebDriverSession(webDriverSessionId);

            return session;
        } catch {
            return null;
        }
    }
}
