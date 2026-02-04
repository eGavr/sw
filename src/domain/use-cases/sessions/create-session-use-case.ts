import { Injectable } from "@nestjs/common";

import { SessionRepository } from "../../../data/repositories/session-repository";

@Injectable()
export class CreateSessionUseCase {
    constructor(private readonly sessionRepository: SessionRepository) {}

    async execute(): Promise<{ id: string }> {
        return this.sessionRepository.create();
    }
}
