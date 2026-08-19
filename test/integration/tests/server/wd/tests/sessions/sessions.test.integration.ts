import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    WebDriverSessionGateway,
} from "../../../../../../../src/application/interfaces/gateways/webdriver-session-gateway";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { SessionRoute } from "../../../../../../../src/presentation/http/session-route";
import { WdModule } from "../../../../../../../src/presentation/http/wd/wd-module";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

type AuthHeader = { authorization: string };

// The request asks for "latest"; a real environment always runs a concrete version (chromeVersion).
const chrome = { name: "chrome", version: "latest" };
const chromeVersion = "141";
const nodeEndpoint = "http://127.0.0.1:45454";
const wdSessionId = "wd-node-session-1";

describe("/sessions", () => {
    let app: INestApplication;
    let createSessionOnNode: jest.Mock;

    beforeEach(async () => {
        createSessionOnNode = jest.fn(async (): Promise<string> => wdSessionId);

        const moduleRef = await Test.createTestingModule({ imports: [WdModule] })
            .overrideProvider(WebDriverSessionGateway)
            .useValue({ create: createSessionOnNode })
            .compile();

        app = moduleRef.createNestApplication();
        app.enableShutdownHooks();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    // A fresh project's owner holds every permission (grant-all on creation), so it may create sessions.
    const seedProject = async (): Promise<{ owner: AuthHeader, projectId: string }> => {
        const externalId = UserFactory.createId();
        const projectRepository = app.get(ProjectRepository);

        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        return { owner: Authorization.forUser(externalId), projectId: project.id };
    };

    // Bring one chrome environment to executing (endpoint + fresh heartbeat) in the given project, so it
    // is allocatable: enqueued -> starting -> preparing -> executing. Returns its id.
    const registerExecutingEnvironment = async (
        projectId: string,
        version: string,
        execution: Execution = Execution.Container,
    ): Promise<string> => {
        const environmentRepository = app.get(EnvironmentRepository);

        await environmentRepository.create({
            projectId: ProjectId.fromString(projectId),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            execution,
            applications: ApplicationList.fromObject([{ name: "chrome", version }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        claimed.register(new EnvironmentEndpoint(nodeEndpoint), new Date());
        await environmentRepository.save(claimed);

        return claimed.id;
    };

    const seedExecutingEnvironment = async (
        execution: Execution = Execution.Container,
    ): Promise<{ owner: AuthHeader, projectId: string, environmentId: string }> => {
        const { owner, projectId } = await seedProject();
        const environmentId = await registerExecutingEnvironment(projectId, chromeVersion, execution);

        return { owner, projectId, environmentId };
    };

    type SessionOpts = { logging?: boolean, video?: boolean, execution?: Execution };
    type ApplicationCaps = { name: string, version: string };

    // W3C "New Session" request: the requested application is the standard browserName/browserVersion,
    // our per-session opt-ins ride as vendor sw:* capabilities, and the project is sw:projectId.
    const capabilities = (projectId: string, application: ApplicationCaps, opts: SessionOpts = {}): object => ({
        capabilities: {
            alwaysMatch: {
                browserName: application.name,
                browserVersion: application.version,
                "sw:projectId": projectId,
                ...(opts.execution === undefined ? {} : { "sw:execution": opts.execution }),
                ...(opts.logging === undefined ? {} : { "sw:logging": opts.logging }),
                ...(opts.video === undefined ? {} : { "sw:video": opts.video }),
            },
        },
    });

    const createSession = (
        projectId: string,
        auth: AuthHeader,
        application: ApplicationCaps = chrome,
        opts: SessionOpts = {},
    ): request.Test =>
        request(app.getHttpServer()).post("/sessions").set(auth).send(capabilities(projectId, application, opts));

    describe("POST /sessions (allocate)", () => {
        test("allocates a free matching environment and returns an id routed to its node", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();

            // W3C New Session-shaped response: { value: { sessionId, capabilities } }.
            const { body } = await createSession(projectId, owner).expect(HttpStatus.OK);
            const caps = body.value.capabilities;

            expect(caps["sw:environmentId"]).toBe(environmentId);
            expect(caps.browserName).toBe("chrome");
            expect(caps.browserVersion).toBe(chromeVersion);
            expect(SessionRoute.decode(body.value.sessionId))
                .toEqual({ endpoint: nodeEndpoint, webDriverSessionId: wdSessionId });

            // The stateless protocols are vendor extension capabilities (sw:*), routed through this wd host.
            const vncSuffix = `/sessions/${body.value.sessionId}/se/vnc`;
            expect(caps["sw:vnc"].startsWith("ws://")).toBe(true);
            expect(caps["sw:vnc"].endsWith(vncSuffix)).toBe(true);
            const base = caps["sw:vnc"].slice(0, -vncSuffix.length);
            expect(caps["sw:bidi"]).toBe(`${base}/sessions/${body.value.sessionId}/se/bidi`);
            expect(caps["sw:cdp"]).toBe(`${base}/sessions/${body.value.sessionId}/se/cdp`);
            expect(createSessionOnNode).toHaveBeenCalledTimes(1);
        });

        test("serves the hosted noVNC viewer page and the noVNC engine it loads", async () => {
            const viewer = await request(app.getHttpServer()).get("/interactive").expect(HttpStatus.OK);
            expect(viewer.text).toContain("/novnc/core/rfb.js");

            const engine = await request(app.getHttpServer()).get("/novnc/core/rfb.js").expect(HttpStatus.OK);
            expect(engine.text).toContain("class RFB");
        });

        test("threads the logging opt-in through to the node session", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            await createSession(projectId, owner, chrome, { logging: true }).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(nodeEndpoint, expect.anything(), "linux", { logging: true, video: false });
        });

        test("threads the video opt-in through to the node session", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            await createSession(projectId, owner, chrome, { video: true }).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(nodeEndpoint, expect.anything(), "linux", { logging: false, video: true });
        });

        test("defaults the logging and video opt-ins to false when omitted", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            await createSession(projectId, owner).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(nodeEndpoint, expect.anything(), "linux", { logging: false, video: false });
        });

        test("responds UNAUTHORIZED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .post("/sessions")
                .send(capabilities(uuidv4(), chrome))
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds UNAUTHORIZED for an invalid token", () => {
            return request(app.getHttpServer())
                .post("/sessions")
                .set(Authorization.invalidToken)
                .send(capabilities(uuidv4(), chrome))
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds FORBIDDEN for a non-owner (no session:create)", async () => {
            const { projectId } = await seedExecutingEnvironment();
            const stranger = Authorization.forUser(UserFactory.createId());

            return createSession(projectId, stranger).expect(HttpStatus.FORBIDDEN);
        });

        test("responds NOT_FOUND for a non-existent project", () => {
            return createSession(uuidv4(), Authorization.forUser(UserFactory.createId())).expect(HttpStatus.NOT_FOUND);
        });

        test("responds CONFLICT when the project has no free matching environment", async () => {
            const { owner, projectId } = await seedProject();

            return createSession(projectId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds CONFLICT when no environment offers the requested application", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            return createSession(projectId, owner, { name: "firefox", version: "latest" }).expect(HttpStatus.CONFLICT);
        });

        test("a latest request allocates the newest running environment", async () => {
            const { owner, projectId } = await seedProject();
            const olderId = await registerExecutingEnvironment(projectId, "139");
            const newerId = await registerExecutingEnvironment(projectId, "141");

            const { body } = await createSession(projectId, owner, { name: "chrome", version: "latest" }).expect(HttpStatus.OK);

            expect(body.value.capabilities["sw:environmentId"]).toBe(newerId);
            expect(body.value.capabilities["sw:environmentId"]).not.toBe(olderId);
            expect(body.value.capabilities.browserVersion).toBe("141");
        });

        test("an exact-version request allocates only that version", async () => {
            const { owner, projectId } = await seedProject();
            await registerExecutingEnvironment(projectId, "141");

            await createSession(projectId, owner, { name: "chrome", version: "141" }).expect(HttpStatus.OK);

            return createSession(projectId, owner, { name: "chrome", version: "140" }).expect(HttpStatus.CONFLICT);
        });

        test("an omitted browserVersion behaves as latest", async () => {
            const { owner, projectId } = await seedProject();
            await registerExecutingEnvironment(projectId, "141");

            const { body } = await request(app.getHttpServer())
                .post("/sessions")
                .set(owner)
                .send({ capabilities: { alwaysMatch: { browserName: "chrome", "sw:projectId": projectId } } })
                .expect(HttpStatus.OK);

            expect(body.value.capabilities.browserVersion).toBe("141");
        });

        test("allocates an environment on the requested execution substrate (sw:execution)", async () => {
            const { owner, projectId } = await seedExecutingEnvironment(Execution.Emulator);

            await createSession(projectId, owner, chrome, { execution: Execution.Emulator }).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledTimes(1);
        });

        test("responds CONFLICT when the free environment is on a different execution substrate", async () => {
            const { owner, projectId } = await seedExecutingEnvironment(Execution.Emulator);

            // No sw:execution -> defaults to container, but the only free environment is an emulator.
            return createSession(projectId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds CONFLICT when the node rejects the session (busy)", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();
            createSessionOnNode.mockRejectedValue(new Error("node full"));

            return createSession(projectId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds BAD_REQUEST for a non-W3C request body (no capabilities envelope)", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            return request(app.getHttpServer())
                .post("/sessions")
                .set(owner)
                .send({ projectId, application: chrome })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds BAD_REQUEST when a required capability is missing (no sw:projectId)", async () => {
            const { owner } = await seedExecutingEnvironment();

            return request(app.getHttpServer())
                .post("/sessions")
                .set(owner)
                .send({ capabilities: { alwaysMatch: { browserName: "chrome", browserVersion: "latest" } } })
                .expect(HttpStatus.BAD_REQUEST);
        });
    });

    // The proxy is stateless: it decodes the target endpoint from the session id, so it can be tested
    // with a crafted id pointing at a fake upstream — no browser needed. Access is by the id (no auth).
    describe("proxy (routed by session id)", () => {
        let upstream: Server;
        let upstreamPort: number;

        beforeAll(async () => {
            upstream = createServer((req, res) => {
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ value: { method: req.method, url: req.url } }));
            });

            await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
            upstreamPort = (upstream.address() as AddressInfo).port;
        });

        afterAll(async () => {
            await new Promise<void>((resolve) => upstream.close(() => resolve()));
        });

        const sessionId = (): string => SessionRoute.encode(`http://127.0.0.1:${upstreamPort}`, "wd-1");

        test("forwards a command to the environment endpoint decoded from the id (no auth)", async () => {
            const { body } = await request(app.getHttpServer()).get(`/sessions/${sessionId()}/url`).expect(HttpStatus.OK);

            expect(body.value).toEqual({ method: "GET", url: "/session/wd-1/url" });
        });

        test("forwards session teardown (DELETE)", async () => {
            const { body } = await request(app.getHttpServer()).delete(`/sessions/${sessionId()}`).expect(HttpStatus.OK);

            expect(body.value).toEqual({ method: "DELETE", url: "/session/wd-1" });
        });

        test("responds BAD_REQUEST for a malformed session id", () => {
            return request(app.getHttpServer()).get("/sessions/not-a-valid-id/url").expect(HttpStatus.BAD_REQUEST);
        });
    });
});
