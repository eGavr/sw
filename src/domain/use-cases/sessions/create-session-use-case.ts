import { Injectable } from "@nestjs/common";

import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { SessionRepository } from "../../../data/repositories/session-repository";
import { Application } from "../../entities/environment/application/application";
import { ApplicationKind } from "../../entities/environment/application/application-kind";
import { EnvironmentId } from "../../entities/environment/environment-id";
import { ApplicationNotAvailableError } from "../../entities/environment/error/application-not-available-error";
import { EnvironmentBusyError } from "../../entities/environment/error/environment-busy-error";
import { Session } from "../../entities/session/session";
import { SessionIdleTimeout } from "../../entities/session/session-idle-timeout";

type CreateSessionInput = {
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
    // FIXME: source the session idle timeout from configuration.
    private readonly idleTimeout = SessionIdleTimeout.fromMilliseconds(60_000);

    constructor(
        private readonly environmentRepository: EnvironmentRepository,
        private readonly sessionRepository: SessionRepository,
    ) {}

    async execute({ params }: CreateSessionInput): Promise<Session> {
        const environmentId = EnvironmentId.fromString(params.environmentId);
        const environment = await this.environmentRepository.get(environmentId);
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
