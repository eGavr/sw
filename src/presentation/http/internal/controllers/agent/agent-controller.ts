import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import type { Response } from "express";

const resourceName = "agentScript";
const downloadVerb = "download";
const contentType = "text/x-shellscript";

// Serves the in-container agent's bootstrap script so environments fetch it at startup instead of
// having it baked into the image (no image rebuild per browser/version). Guarded by the module's
// InternalSecretGuard like every internal route — the agent sends the same x-internal-secret it uses
// for heartbeats. Media download, so the raw script is written directly, bypassing the JSON presenter.
@Controller("internal")
export class InternalAgentController {
    private readonly script = readFileSync(join(__dirname, "heartbeat-agent.sh"), "utf8");

    // Custom method (AIP-136): GET /internal/agentScript:download. express matches "agentScript:download"
    // as one path segment, so the verb is split off the last ":" here.
    @Get(":resource")
    downloadAgentScript(@Param("resource") resource: string, @Res() response: Response): void {
        const separatorIndex = resource.lastIndexOf(":");
        const name = separatorIndex === -1 ? resource : resource.slice(0, separatorIndex);
        const verb = separatorIndex === -1 ? "" : resource.slice(separatorIndex + 1);

        if (name !== resourceName || verb !== downloadVerb) {
            throw new NotFoundException(`unknown internal resource: ${resource}`);
        }

        response.type(contentType).send(this.script);
    }
}
