import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { WebSocket, WebSocketServer } from "ws";

import {
    WebDriverClient,
} from "../../../../../../../src/infrastructure/gateways/webdriver-session/webdriver-client";
import { SessionRoute } from "../../../../../../../src/presentation/http/session-route";
import { WdModule } from "../../../../../../../src/presentation/http/wd/wd-module";
import { WebSocketProxy } from "../../../../../../../src/presentation/http/wd/websocket-proxy";

const wdSessionId = "wd-ws-liveness-session";

// The websocket capability is the id of a LIVE session, for the pipe's whole life: a dead session's
// id opens nothing, and an established pipe is torn down once its session dies. Liveness is answered
// by the node's status (the mocked client), never by a session command.
describe("websocket pipe liveness", () => {
    let app: INestApplication;
    let fetchCurrentSessionOnNode: jest.Mock;
    let upstream: Server;
    let upstreamSockets: WebSocketServer;
    let upstreamConnections: number;
    let upstreamPort: number;
    let proxyPort: number;

    beforeAll(() => {
        process.env.WD_PIPE_LIVENESS_INTERVAL_MS = "100";
    });

    afterAll(() => {
        delete process.env.WD_PIPE_LIVENESS_INTERVAL_MS;
    });

    beforeEach(async () => {
        upstreamConnections = 0;
        upstream = createServer();
        upstreamSockets = new WebSocketServer({ server: upstream });
        upstreamSockets.on("connection", () => {
            upstreamConnections += 1;
        });
        await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
        upstreamPort = (upstream.address() as AddressInfo).port;

        fetchCurrentSessionOnNode = jest.fn(async (): Promise<string | null> => wdSessionId);

        const moduleRef = await Test.createTestingModule({ imports: [WdModule] })
            .overrideProvider(WebDriverClient)
            .useValue({
                createSession: jest.fn(),
                deleteSession: jest.fn(),
                fetchCurrentSession: fetchCurrentSessionOnNode,
            })
            .compile();

        app = moduleRef.createNestApplication();
        await app.init();

        // The upgrade handler is attached by the wd entrypoint in production; the test wires the same
        // pair by hand and listens on a real port (websockets need one).
        const server = app.getHttpServer();
        const proxy = app.get(WebSocketProxy);
        server.on("upgrade", (request: never, socket: never, head: never) =>
            proxy.handleUpgrade(request, socket, head));
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        proxyPort = (server.address() as AddressInfo).port;
    });

    afterEach(async () => {
        await app.close();
        upstreamSockets.close();
        await new Promise<void>((resolve) => upstream.close(() => resolve()));
    });

    const connect = (): WebSocket => {
        const sessionId = SessionRoute.encode(`http://127.0.0.1:${upstreamPort}`, wdSessionId);

        return new WebSocket(`ws://127.0.0.1:${proxyPort}/sessions/${sessionId}/se/vnc`);
    };

    const closedWith = (socket: WebSocket): Promise<number> =>
        new Promise((resolve) => {
            socket.on("close", (code) => resolve(code));
            socket.on("error", () => undefined);
        });

    const until = async (condition: () => boolean): Promise<void> => {
        for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    };

    test("refuses the upgrade when the node no longer holds the session", async () => {
        fetchCurrentSessionOnNode.mockResolvedValue(null);

        const client = connect();

        await closedWith(client);
        expect(upstreamConnections).toBe(0);
    });

    test("tears an established pipe down once its session dies", async () => {
        const client = connect();
        await new Promise<void>((resolve) => client.on("open", () => resolve()));
        await until(() => upstreamConnections === 1);
        expect(upstreamConnections).toBe(1);

        fetchCurrentSessionOnNode.mockResolvedValue(null);

        const code = await closedWith(client);
        expect(code).toBe(1000);
    });
});
