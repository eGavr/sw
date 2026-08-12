import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Controller, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

const agentScriptResource = "agentScript";
const ffmpegResource = "ffmpeg";
const downloadVerb = "download";

const scriptContentType = "text/x-shellscript";
const binaryContentType = "application/octet-stream";

// The agent maps `uname -m` to one of these before requesting its ffmpeg build.
const supportedArchitectures = ["amd64", "arm64"];
const defaultFfmpegDir = "bin/ffmpeg";

// Serves the assets the in-container agent fetches at startup so they are not baked into the image (no
// rebuild per browser/version): the bootstrap script (always) and a static ffmpeg binary (only when a
// session opts into video recording, fetched lazily by architecture). Guarded by the module's
// InternalSecretGuard like every internal route — the agent sends the same x-internal-secret it uses for
// heartbeats. Media downloads, written straight to the response, bypassing the JSON presenter.
@Controller("internal")
export class InternalAgentController {
    private readonly script = readFileSync(join(__dirname, "heartbeat-agent.sh"), "utf8");

    constructor(private readonly configService: ConfigService) {}

    // Custom method (AIP-136): GET /internal/{resource}:download. express matches "{resource}:download" as
    // one path segment, so the verb is split off the last ":" here.
    @Get(":resource")
    download(@Param("resource") resource: string, @Query("arch") arch: string, @Res() response: Response): void {
        const [name, verb] = this.split(resource);

        if (verb !== downloadVerb) {
            throw new NotFoundException(`unknown internal resource: ${resource}`);
        }

        switch (name) {
            case agentScriptResource:
                response.type(scriptContentType).send(this.script);

                return;
            case ffmpegResource:
                this.sendFfmpeg(arch, response);

                return;
            default:
                throw new NotFoundException(`unknown internal resource: ${resource}`);
        }
    }

    private sendFfmpeg(arch: string, response: Response): void {
        if (!supportedArchitectures.includes(arch)) {
            throw new NotFoundException(`unsupported ffmpeg architecture: ${arch || "(none)"}`);
        }

        const directory = this.configService.get<string>("INTERNAL_FFMPEG_DIR") ?? defaultFfmpegDir;
        const path = join(directory, `ffmpeg-${arch}`);

        if (!existsSync(path)) {
            throw new NotFoundException(`ffmpeg binary is not available for architecture: ${arch}`);
        }

        response.type(binaryContentType);
        createReadStream(path).pipe(response);
    }

    private split(resource: string): [string, string] {
        const separatorIndex = resource.lastIndexOf(":");

        return separatorIndex === -1
            ? [resource, ""]
            : [resource.slice(0, separatorIndex), resource.slice(separatorIndex + 1)];
    }
}
