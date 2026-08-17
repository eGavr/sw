import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../domain/entities/account/account-id";
import { Application } from "../../../domain/entities/environment/application/application";
import { Environment } from "../../../domain/entities/environment/environment";
import { EnvironmentId } from "../../../domain/entities/environment/environment-id";
import { toExecution } from "../../../domain/entities/environment/execution";
import { defaultHeartbeatFreshnessMs } from "../../../domain/entities/environment/heartbeat-freshness";
import { SessionAllocationCriteria } from "../../../domain/entities/environment/session-allocation-criteria";
import { NoAllocatableEnvironmentError } from "../../../domain/entities/session/error/no-allocatable-environment-error";
import { Session } from "../../../domain/entities/session/session";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { WebDriverSessionGateway, WebDriverSessionOptions } from "../../interfaces/gateways/webdriver-session-gateway";
import { AccountRepository } from "../../interfaces/repositories/account-repository";
import { EnvironmentRepository } from "../../interfaces/repositories/environment-repository";
import { AccessControl } from "../../services/access-control";

type CreateSessionInput = {
    creds: {
        token: string;
    },
    params: {
        accountId: string;
        execution: string;
        application: {
            name: string;
            version: string;
        };
        logging?: boolean;
        video?: boolean;
    },
}

// Pool allocation: the caller asks for an application, not a specific environment. We pick a free,
// fresh, matching environment from the account and open the session on its node. The node is the real
// 1:1 arbiter, so the DB `busy` is only a hint — we try candidates until one accepts and never write
// to the DB here (the next agent heartbeat reports the new busy state).
@Injectable()
export class CreateSessionUseCase {
    private readonly permissionName = UserPermissionName.Session.Create;

    constructor(
        private readonly accessControl: AccessControl,
        private readonly accountRepository: AccountRepository,
        private readonly environmentRepository: EnvironmentRepository,
        private readonly webDriverSessionGateway: WebDriverSessionGateway,
    ) {}

    async execute({ creds, params }: CreateSessionInput): Promise<Session> {
        const user = await this.accessControl.authenticate(creds);
        const accountId = AccountId.fromString(params.accountId);
        const account = await this.accountRepository.get(accountId);

        await this.accessControl.authorize(user, account, this.permissionName);

        const application = Application.fromObject(params.application);
        const criteria = SessionAllocationCriteria.from({
            now: new Date(),
            freshnessMs: defaultHeartbeatFreshnessMs,
            execution: toExecution(params.execution),
            application,
        });
        const candidates = await this.environmentRepository.findAllocatable(accountId, criteria);

        return this.allocate(candidates, application, { logging: params.logging ?? false, video: params.video ?? false });
    }

    private async allocate(
        candidates: Array<Environment>,
        application: Application,
        options: WebDriverSessionOptions,
    ): Promise<Session> {
        for (const candidate of candidates) {
            const session = await this.tryAllocate(candidate, application, options);

            if (session) {
                return session;
            }
        }

        throw new NoAllocatableEnvironmentError(application.name, application.version);
    }

    private async tryAllocate(
        environment: Environment,
        application: Application,
        options: WebDriverSessionOptions,
    ): Promise<Session | null> {
        if (!environment.endpoint) {
            return null;
        }

        try {
            const webDriverSessionId = await this.webDriverSessionGateway.create(
                environment.endpoint,
                application,
                environment.platform.name,
                options,
            );

            return Session.create({
                environmentId: EnvironmentId.fromString(environment.id),
                application,
                endpoint: environment.endpoint,
                webDriverSessionId,
            });
        } catch {
            return null;
        }
    }
}
