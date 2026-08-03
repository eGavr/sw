import { Body, Controller, Delete, Param, Post } from "@nestjs/common";

import { CreateSessionUseCase } from "../../../../../../../domain/use-cases/sessions/create-session-use-case";
import { DeleteSessionUseCase } from "../../../../../../../domain/use-cases/sessions/delete-session-use-case";

import { CreateSessionRequestDto } from "./dtos/create-session-request-dto";
import { DeleteSessionRequestDto } from "./dtos/delete-session-request-dto";
import { SessionDto } from "./dtos/session-dto";

// FIXME: add data-plane authentication (external IdP / OAuth) once the auth strategy for wd lands.
@Controller("sessions")
export class SessionsController {
    constructor(
        private readonly createSessionUseCase: CreateSessionUseCase,
        private readonly deleteSessionUseCase: DeleteSessionUseCase,
    ) {}

    @Post()
    async createSession(@Body() params: CreateSessionRequestDto): Promise<SessionDto> {
        return new SessionDto(await this.createSessionUseCase.execute({ params }));
    }

    @Delete(":sessionId")
    async deleteSession(@Param() params: DeleteSessionRequestDto): Promise<SessionDto> {
        return new SessionDto(await this.deleteSessionUseCase.execute({ params }));
    }
}
