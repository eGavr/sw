import { Server } from "node:http";
import { AddressInfo } from "node:net";

import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ChannelOp, decodeChannel, encodeChannelData } from "@sw/netbridge";
import { RawData, WebSocket } from "ws";

import { AgentTokenService } from "../../../../../../../src/application/interfaces/agent-token-service";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    NetBridgeCredentialRepository,
} from "../../../../../../../src/application/interfaces/repositories/net-bridge-credential-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import {
    NetBridgeCredential,
} from "../../../../../../../src/domain/entities/net-bridge-credential/net-bridge-credential";
import { NetBridgeSecret } from "../../../../../../../src/domain/entities/net-bridge-credential/net-bridge-secret";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { NetBridgeRendezvous } from "../../../../../../../src/presentation/http/wd/net-bridge-rendezvous";
import { WdModule } from "../../../../../../../src/presentation/http/wd/wd-module";
import { WebSocketProxy } from "../../../../../../../src/presentation/http/wd/websocket-proxy";
import { UserFactory } from "../../../utils/entities/user/user-factory";

type SeededTunnel = {
    secret: string;
    environmentToken: string;
};

const toBuffer = (data: RawData): Buffer => (Array.isArray(data) ? Buffer.concat(data) : data as Buffer);

describe("NetBridge rendezvous", () => {
    let app: INestApplication;
    let server: Server;
    let port: number;
    let sockets: Array<WebSocket> = [];

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [WdModule] }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        // The upgrade handler is attached by the wd entrypoint in production; the test wires the same
        // routing by hand and listens on a real port (websockets need one).
        server = app.getHttpServer();
        const rendezvous = app.get(NetBridgeRendezvous);
        const proxy = app.get(WebSocketProxy);

        server.on("upgrade", (request: never, socket: never, head: never) => {
            if (rendezvous.handles((request as { url?: string }).url)) {
                rendezvous.handleUpgrade(request, socket, head);

                return;
            }

            proxy.handleUpgrade(request, socket, head);
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        port = (server.address() as AddressInfo).port;
        sockets = [];
    });

    afterEach(async () => {
        for (const socket of sockets) {
            socket.terminate();
        }

        // Nest's close stops accepting connections but leaves upgraded sockets open; drop them so the
        // test process exits promptly.
        server.closeAllConnections?.();
        await app.close();
    });

    const seed = async (): Promise<SeededTunnel> => {
        const externalId = UserFactory.createId();
        const projectRepository = app.get<ProjectRepository>(ProjectRepository);
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });

        await projectRepository.save(project);
        const projectId = ProjectId.fromString(project.id);

        const secret = NetBridgeSecret.generate();
        await app.get<NetBridgeCredentialRepository>(NetBridgeCredentialRepository)
            .save(NetBridgeCredential.create({ projectId, secret }));

        const environment = await app.get<EnvironmentRepository>(EnvironmentRepository).create({
            projectId,
            platform: Platform.fromObject({ name: "ubuntu", version: "24.04" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });
        const environmentToken = await app.get<AgentTokenService>(AgentTokenService).issue(environment.id);

        return { secret: secret.getValue(), environmentToken };
    };

    const connect = (path: string, bearer: string): WebSocket => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: { authorization: `Bearer ${bearer}` } });

        socket.on("error", () => undefined);
        sockets.push(socket);

        return socket;
    };

    const opened = (socket: WebSocket): Promise<void> =>
        new Promise((resolve, reject) => {
            socket.on("open", () => resolve());
            socket.on("error", (error) => reject(error));
        });

    const nextMessage = (socket: WebSocket): Promise<Buffer> =>
        new Promise((resolve) => socket.once("message", (data) => resolve(toBuffer(data))));

    const refused = (socket: WebSocket): Promise<boolean> =>
        new Promise((resolve) => {
            socket.on("open", () => resolve(false));
            socket.on("close", () => resolve(true));
            socket.on("error", () => resolve(true));
        });

    test("relays a forwarder frame to the client wrapped in its channel, and back", async () => {
        const { secret, environmentToken } = await seed();

        const client = connect("/netbridge/client", secret);
        await opened(client);

        const forwarder = connect("/netbridge/agent", environmentToken);
        await opened(forwarder);

        const wrapped = nextMessage(client);
        forwarder.send(Buffer.from("ping"));

        const decoded = decodeChannel(await wrapped);
        expect(decoded.op).toBe(ChannelOp.Data);
        expect((decoded as { inner: Buffer }).inner.toString()).toBe("ping");

        const backToForwarder = nextMessage(forwarder);
        client.send(encodeChannelData(decoded.channelId, Buffer.from("pong")));

        expect((await backToForwarder).toString()).toBe("pong");
    });

    test("refuses a forwarder when no client is attached for its project", async () => {
        const { environmentToken } = await seed();

        const forwarder = connect("/netbridge/agent", environmentToken);
        const closedSoon = new Promise<boolean>((resolve) => {
            forwarder.on("close", () => resolve(true));
            setTimeout(() => resolve(false), 2000);
        });

        expect(await closedSoon).toBe(true);
    });

    test("refuses a client with an unknown access key", async () => {
        expect(await refused(connect("/netbridge/client", "swnb_not-a-real-key"))).toBe(true);
    });

    test("refuses a forwarder with an invalid agent token", async () => {
        expect(await refused(connect("/netbridge/agent", "not-a-valid-token"))).toBe(true);
    });

    test("refuses a client upgrade without a bearer token", async () => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/netbridge/client`);

        socket.on("error", () => undefined);
        sockets.push(socket);

        expect(await refused(socket)).toBe(true);
    });
});
