import { Injectable } from "@nestjs/common";

import { Session } from "../../../domain/entities/session/session";
import { SessionId } from "../../../domain/entities/session/session-id";
import { SessionRepository } from "../../../infrastructure/repositories/session-repository";

type DeleteSessionInput = {
    params: {
        sessionId: string;
    },
}

@Injectable()
export class DeleteSessionUseCase {
    constructor(private readonly sessionRepository: SessionRepository) {}

    async execute({ params }: DeleteSessionInput): Promise<Session> {
        const sessionId = SessionId.fromString(params.sessionId);
        const session = await this.sessionRepository.get(sessionId);

        await this.sessionRepository.delete(sessionId);

        return session;
    }
}
