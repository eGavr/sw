import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";

// Serves the hosted noVNC viewer page for interactive access to a live session: a human opens the
// `sw:interactive` URL from the create-session response and can watch and drive the session. The session is
// chosen by the `?path=sessions/{id}/se/vnc` query (the `sw:vnc` path); the page opens that WebSocket on this
// host, which the WS proxy routes to the environment's VNC. The noVNC engine itself is served as static files
// under /novnc/ (see WdModule). Media response, written directly, bypassing the JSON response interceptor.
@Controller("interactive")
export class InteractiveController {
    private readonly page = readFileSync(join(__dirname, "interactive.html"), "utf8");

    @Get()
    viewer(@Res() response: Response): void {
        response.type("html").send(this.page);
    }
}
