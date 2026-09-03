import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Controller, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

const agentScriptResource = "agentScript";
const ffmpegResource = "ffmpeg";
const netbridgeResource = "netbridge";
const downloadVerb = "download";

const scriptContentType = "text/x-shellscript";
const binaryContentType = "application/octet-stream";

// The agent maps `uname -m` to one of these before requesting an architecture-specific binary.
const supportedArchitectures = ["amd64", "arm64"];
const defaultFfmpegDir = "bin/ffmpeg";
const defaultNetbridgeDir = "bin/netbridge";

// Serves the assets the in-container agent fetches at startup so they are not baked into the image (no
// rebuild per browser/version): the bootstrap script (always), a static ffmpeg binary (when a session
// opts into video), and the NetBridge forwarder binary (when the environment offers local-network
// tunnelling) — both fetched by architecture. Guarded by the module's InternalAgentTokenGuard like every
// internal route — the agent sends the same per-environment bearer token it uses for heartbeats. Binary
// downloads are written straight to the response, bypassing the JSON presenter.
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
            case netbridgeResource:
                this.sendNetbridge(arch, response);

                return;
            default:
                throw new NotFoundException(`unknown internal resource: ${resource}`);
        }
    }

    private sendFfmpeg(arch: string, response: Response): void {
        const directory = this.configService.get<string>("INTERNAL_FFMPEG_DIR") ?? defaultFfmpegDir;

        this.sendBinary(ffmpegResource, directory, `ffmpeg-${arch}`, arch, response);
    }

    private sendNetbridge(arch: string, response: Response): void {
        const directory = this.configService.get<string>("INTERNAL_NETBRIDGE_DIR") ?? defaultNetbridgeDir;

        this.sendBinary(netbridgeResource, directory, `netbridge-${arch}`, arch, response);
    }

    private sendBinary(resource: string, directory: string, fileName: string, arch: string, response: Response): void {
        if (!supportedArchitectures.includes(arch)) {
            throw new NotFoundException(`unsupported ${resource} architecture: ${arch || "(none)"}`);
        }

        const path = join(directory, fileName);

        if (!existsSync(path)) {
            throw new NotFoundException(`${resource} binary is not available for architecture: ${arch}`);
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
