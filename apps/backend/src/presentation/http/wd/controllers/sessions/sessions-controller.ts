import { All, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { CreateSessionUseCase } from "../../../../../application/use-cases/sessions/create-session-use-case";
import {
    ProbeSessionLivenessUseCase,
} from "../../../../../application/use-cases/sessions/probe-session-liveness-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { SessionRoute } from "../../../session-route";
import { WebDriverProxy } from "../../webdriver-proxy";
import { WebSocketProxy } from "../../websocket-proxy";

import { CreateSessionRequestModel } from "./io/create-session-request-model";
import { resolveSessionRequest } from "./io/session-capabilities";
import { SessionPresenter } from "./io/session-presenter";

// Auth is required only to CREATE a session; subsequent commands and teardown are authorized by
// possession of the (unguessable) session id, so /sessions/:id/* is intentionally not authenticated.
@Controller("sessions")
export class SessionsController {
    constructor(
        private readonly createSessionUseCase: CreateSessionUseCase,
        private readonly probeSessionLivenessUseCase: ProbeSessionLivenessUseCase,
        private readonly webDriverProxy: WebDriverProxy,
        private readonly webSocketProxy: WebSocketProxy,
    ) {}

    // W3C New Session returns 200 (not 201); the response is shaped to match (see SessionPresenter).
    @Post()
    @HttpCode(HttpStatus.OK)
    async createSession(
        @Body() body: CreateSessionRequestModel,
        @BearerToken() token: string,
        @Req() request: Request,
    ): Promise<SessionPresenter> {
        const params = resolveSessionRequest(body.capabilities);
        const session = await this.createSessionUseCase.execute({ creds: { token }, params });

        return new SessionPresenter(session, this.webSocketBaseUrl(request), this.httpBaseUrl(request));
    }

    // The wd host the client reached us on, as a ws(s) origin — the proxy the advertised URLs point at.
    private webSocketBaseUrl(request: Request): string {
        const scheme = request.protocol === "https" ? "wss" : "ws";

        return `${scheme}://${request.get("host") ?? ""}`;
    }

    // The same host as an http(s) origin — the hosted interactive viewer page a human opens.
    private httpBaseUrl(request: Request): string {
        return `${request.protocol}://${request.get("host") ?? ""}`;
    }

    // Vendor liveness probe (the sw/ namespace, like the se/ websocket routes): answered from the
    // NODE's status, never by a session command — a watcher must not reset the session's idle timer
    // or leave phantom traffic in its logs. Declared before the catch-all proxy routes.
    @Get(":sessionId/sw/alive")
    async sessionAlive(@Param("sessionId") sessionId: string): Promise<{ alive: boolean }> {
        const route = SessionRoute.decode(sessionId);

        // A value that does not even decode is no live session — same answer, no format lecture.
        if (!route) {
            return { alive: false };
        }

        return {
            alive: await this.probeSessionLivenessUseCase.execute({
                endpoint: route.endpoint,
                webDriverSessionId: route.webDriverSessionId,
            }),
        };
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

            // The one wd instance that witnesses the session's delete severs its own pipes the same
            // moment (other instances' pipes are the watchdog's job — no shared state by design).
            if (request.method === "DELETE" && tail === "" && upstream.status < 300) {
                this.webSocketProxy.severFor(route.endpoint, route.webDriverSessionId);
            }
        } catch {
            response.status(502).json({ error: "webdriver proxy failed" });
        }
    }
}
