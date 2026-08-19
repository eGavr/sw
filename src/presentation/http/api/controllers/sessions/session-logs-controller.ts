import { BadRequestException, Controller, Get, Param } from "@nestjs/common";

import { GetSessionLogsUseCase } from "../../../../../application/use-cases/sessions/get-session-logs-use-case";
import { BearerToken } from "../../../decorators/param/bearer-token";
import { SessionRoute } from "../../../session-route";

import { SessionLogPresenter } from "./io/session-log-presenter";

// Read a finished session's logs by session id. The project is in the path (durable — the environment the
// session ran on may already be gone), and the session id is decoded to the WebDriver session id that keys
// the stored log. Access is the project's IAM (sw.sessions.get), like the rest of the control plane.
@Controller("projects/:project/sessions")
export class SessionLogsController {
    constructor(private readonly getSessionLogsUseCase: GetSessionLogsUseCase) {}

    @Get(":sessionId/logs")
    async getSessionLogs(
        @Param("project") project: string,
        @Param("sessionId") sessionId: string,
        @BearerToken() token: string,
    ): Promise<SessionLogPresenter> {
        const route = SessionRoute.decode(sessionId);

        if (!route) {
            throw new BadRequestException("invalid session id");
        }

        const log = await this.getSessionLogsUseCase.execute({
            creds: { token },
            params: { projectId: project, webDriverSessionId: route.webDriverSessionId },
        });

        return new SessionLogPresenter(log);
    }
}
