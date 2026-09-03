import { Server } from "node:http";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { NetBridgeRendezvous } from "./net-bridge-rendezvous";
import { WdModule } from "./wd-module";
import { WebSocketProxy } from "./websocket-proxy";

(async function(): Promise<void> {
    const app = await NestFactory.create(WdModule);

    const configService = app.get(ConfigService);
    const webSocketProxy = app.get(WebSocketProxy);
    const netBridgeRendezvous = app.get(NetBridgeRendezvous);

    // WebSocket upgrades bypass the Nest/express request pipeline, so route them at the server. Tunnel
    // upgrades go to the rendezvous; everything else (BiDi/DevTools/VNC) to the WebDriver session proxy.
    const server = app.getHttpServer() as Server;

    server.on("upgrade", (request, socket, head) => {
        if (netBridgeRendezvous.handles(request.url)) {
            netBridgeRendezvous.handleUpgrade(request, socket, head);

            return;
        }

        webSocketProxy.handleUpgrade(request, socket, head);
    });

    await app.listen(configService.getOrThrow("WD_PORT"));
})();
