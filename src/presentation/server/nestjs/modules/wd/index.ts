import { Server } from "node:http";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { WdModule } from "./wd-module";
import { WebSocketProxy } from "./websocket-proxy";

(async function(): Promise<void> {
    const app = await NestFactory.create(WdModule);

    const configService = app.get(ConfigService);
    const webSocketProxy = app.get(WebSocketProxy);

    // WebSocket upgrades bypass the Nest/express request pipeline, so route them at the server.
    const server = app.getHttpServer() as Server;

    server.on("upgrade", (request, socket, head) => webSocketProxy.handleUpgrade(request, socket, head));

    await app.listen(configService.getOrThrow("WD_PORT"));
})();
