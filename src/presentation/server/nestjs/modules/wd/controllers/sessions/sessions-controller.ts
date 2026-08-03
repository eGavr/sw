import { All, Body, Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { CreateSessionUseCase } from "../../../../../../../domain/use-cases/sessions/create-session-use-case";
import { BearerToken } from "../../../../decorators/param/bearer-token";
import { SessionRoute } from "../../session-route";
import { WebDriverProxy } from "../../webdriver-proxy";

import { CreateSessionRequestDto } from "./dtos/create-session-request-dto";
import { SessionDto } from "./dtos/session-dto";

// Auth is required only to CREATE a session; subsequent commands and teardown are authorized by
// possession of the (unguessable) session id, so /sessions/:id/* is intentionally not authenticated.
@Controller("sessions")
export class SessionsController {
    constructor(
        private readonly createSessionUseCase: CreateSessionUseCase,
        private readonly webDriverProxy: WebDriverProxy,
    ) {}

    @Post()
    async createSession(@Body() params: CreateSessionRequestDto, @BearerToken() token: string): Promise<SessionDto> {
        return new SessionDto(await this.createSessionUseCase.execute({ creds: { token }, params }));
    }

    @All(":sessionId")
    async proxySessionRoot(@Req() request: Request, @Res() response: Response): Promise<void> {
        await this.proxy(request, response);
    }

    @All(":sessionId/*rest")
    async proxySessionCommand(@Req() request: Request, @Res() response: Response): Promise<void> {
        await this.proxy(request, response);
    }

    private async proxy(request: Request, response: Response): Promise<void> {
        const token = request.params.sessionId as string;
        const route = SessionRoute.decode(token);

        if (!route) {
            response.status(400).json({ error: "invalid session id" });

            return;
        }

        const prefix = `/sessions/${token}/`;
        const tail = request.path.startsWith(prefix) ? request.path.slice(prefix.length) : "";
        const body = request.body && Object.keys(request.body).length > 0 ? JSON.stringify(request.body) : undefined;

        try {
            const upstream = await this.webDriverProxy.forward(route.endpoint, route.webDriverSessionId, {
                method: request.method,
                path: tail,
                headers: { "content-type": request.headers["content-type"] },
                body,
            });

            response.status(upstream.status).set(upstream.headers).send(upstream.body);
        } catch {
            response.status(502).json({ error: "webdriver proxy failed" });
        }
    }
}
