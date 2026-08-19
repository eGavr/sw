import { BadRequestException, Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";

import { GetSessionLogsUseCase } from "../../../../../application/use-cases/sessions/get-session-logs-use-case";
import { GetSessionVideoUseCase } from "../../../../../application/use-cases/sessions/get-session-video-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { SessionRoute } from "../../../session-route";

import { SessionLogPresenter } from "./io/session-log-presenter";

// Read a finished session's artifacts (logs, video) by session id. The project is in the path (durable —
// the environment the session ran on may already be gone), and the session id is decoded to the WebDriver
// session id that keys the stored artifact. Access is the project's IAM (sw.sessions.get).
@Controller("projects/:project/sessions")
export class SessionArtifactsController {
    constructor(
        private readonly getSessionLogsUseCase: GetSessionLogsUseCase,
        private readonly getSessionVideoUseCase: GetSessionVideoUseCase,
    ) {}

    @Get(":sessionId/logs")
    async getSessionLogs(
        @Param("project") project: string,
        @Param("sessionId") sessionId: string,
        @BearerToken() token: string,
    ): Promise<SessionLogPresenter> {
        const webDriverSessionId = this.decode(sessionId);

        const log = await this.getSessionLogsUseCase.execute({
            creds: { token },
            params: { projectId: project, webDriverSessionId },
        });

        return new SessionLogPresenter(log);
    }

    // The recording is streamed straight through to the client (it can be large), so this handler owns the
    // response instead of returning a presenter. Errors thrown before piping (bad id / auth / not found)
    // still flow to the exception filter, which writes the response.
    @Get(":sessionId/video")
    async getSessionVideo(
        @Param("project") project: string,
        @Param("sessionId") sessionId: string,
        @BearerToken() token: string,
        @Res() response: Response,
    ): Promise<void> {
        const webDriverSessionId = this.decode(sessionId);

        const video = await this.getSessionVideoUseCase.execute({
            creds: { token },
            params: { projectId: project, webDriverSessionId },
        });

        response.setHeader("content-type", video.contentType ?? "video/mp4");
        video.body.on("error", () => response.destroy());
        video.body.pipe(response);
    }

    private decode(sessionId: string): string {
        const route = SessionRoute.decode(sessionId);

        if (!route) {
            throw new BadRequestException("invalid session id");
        }

        return route.webDriverSessionId;
    }
}
