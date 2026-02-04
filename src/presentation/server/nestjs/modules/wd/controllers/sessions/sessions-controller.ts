import { Controller, Post } from "@nestjs/common";

import { CreateSessionUseCase } from "../../../../../../../domain/use-cases/sessions/create-session-use-case";

@Controller("sessions")
export class SessionsController {
    constructor(
        private readonly createSessionUseCase: CreateSessionUseCase,
    ) {}

    @Post()
    async createSession(): Promise<{ id: string }> {
        return this.createSessionUseCase.execute();
    }
}
