import { Injectable } from "@nestjs/common";

import { SessionRepository } from "../../application/interfaces/repositories/session-repository";
import { EnvironmentId } from "../../domain/entities/environment/environment-id";
import { SessionNotFoundError } from "../../domain/entities/session/error/session-not-found-error";
import { Session } from "../../domain/entities/session/session";
import { SessionId } from "../../domain/entities/session/session-id";
import { SessionDataSource } from "../data-sources/compute/session-data-source";

@Injectable()
export class SessionRepositoryImpl extends SessionRepository {
    constructor(private readonly sessionDataSource: SessionDataSource) {
        super();
    }

    async create(session: Session): Promise<Session> {
        const data = await this.sessionDataSource.create(session.toObject());

        return Session.fromObject(data);
    }

    async get(sessionId: SessionId): Promise<Session> {
        const data = await this.sessionDataSource.get(sessionId.getValue());

        if (!data) {
            throw new SessionNotFoundError(sessionId.getValue());
        }

        return Session.fromObject(data);
    }

    async listByEnvironment(environmentId: EnvironmentId): Promise<Array<Session>> {
        const data = await this.sessionDataSource.listByEnvironment(environmentId.getValue());

        return data.map(Session.fromObject);
    }

    async delete(sessionId: SessionId): Promise<void> {
        await this.sessionDataSource.delete(sessionId.getValue());
    }
}
