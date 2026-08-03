import { Injectable } from "@nestjs/common";

import { SessionRepository } from "../../../data/repositories/session-repository";
import { Session } from "../../entities/session/session";
import { SessionId } from "../../entities/session/session-id";

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
