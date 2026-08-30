import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    SessionOwnershipRepository,
} from "../../../../../../../src/application/interfaces/repositories/session-ownership-repository";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import {
    EnvironmentOccupancy,
} from "../../../../../../../src/domain/entities/environment/environment-occupancy";
import { Execution } from "../../../../../../../src/domain/entities/environment/execution";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { SessionOwnership } from "../../../../../../../src/domain/entities/session/session-ownership";
import { User } from "../../../../../../../src/domain/entities/user/user";
import {
    WebDriverClient,
} from "../../../../../../../src/infrastructure/gateways/webdriver-session/webdriver-client";
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

        // Only the final client wrapper over the external node is mocked — the gateway's own error
        // translation (node failure -> "session not created") stays under test.
        const moduleRef = await Test.createTestingModule({ imports: [WdModule] })
            .overrideProvider(WebDriverClient)
            .useValue({ createSession: createSessionOnNode, deleteSession: jest.fn(), fetchCurrentSession: jest.fn() })
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

    type SessionOpts = { logging?: boolean, video?: boolean, execution?: Execution, environmentId?: string };
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
                ...(opts.environmentId === undefined ? {} : { "sw:environmentId": opts.environmentId }),
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

            // sw:interactive is the ready-to-open hosted viewer page (http origin), pointed at the sw:vnc path.
            const httpBase = base.replace(/^ws/, "http");
            expect(caps["sw:interactive"]).toBe(`${httpBase}/interactive?path=sessions/${body.value.sessionId}/se/vnc`);
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

            expect(createSessionOnNode).toHaveBeenCalledWith(
                nodeEndpoint,
                expect.objectContaining({ platformName: "linux" }),
                { logging: true, video: false },
            );
        });

        test("threads the video opt-in through to the node session", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            await createSession(projectId, owner, chrome, { video: true }).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(
                nodeEndpoint,
                expect.objectContaining({ platformName: "linux" }),
                { logging: false, video: true },
            );
        });

        test("defaults the logging and video opt-ins to false when omitted", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            await createSession(projectId, owner).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(
                nodeEndpoint,
                expect.objectContaining({ platformName: "linux" }),
                { logging: false, video: false },
            );
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

        // Nothing offers the request at all -> a non-retryable FAILED_PRECONDITION (400), not a conflict:
        // no amount of waiting helps until an environment is created.
        test("responds FAILED_PRECONDITION when the project has no environment at all", async () => {
            const { owner, projectId } = await seedProject();

            return createSession(projectId, owner)
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(JSON.stringify(response.body)).toMatch(/create one first/));
        });

        test("responds CONFLICT when matching environments exist but are all busy", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();
            const environmentRepository = app.get(EnvironmentRepository);
            const environment = await environmentRepository.get(EnvironmentId.fromString(environmentId));
            environment.heartbeat(true, new Date());
            await environmentRepository.save(environment);

            return createSession(projectId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds CONFLICT while the only matching environment is still provisioning", async () => {
            const { owner, projectId } = await seedProject();
            const environmentRepository = app.get(EnvironmentRepository);
            await environmentRepository.create({
                projectId: ProjectId.fromString(projectId),
                platform: Platform.fromObject({ name: "linux", version: "latest" }),
                applications: ApplicationList.fromObject([{ name: "chrome", version: chromeVersion }]),
            });

            return createSession(projectId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds FAILED_PRECONDITION when no environment offers the requested application", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            return createSession(projectId, owner, { name: "firefox", version: "latest" })
                .expect(HttpStatus.BAD_REQUEST);
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

            // 140 is offered by nothing in the project -> non-retryable failed precondition.
            return createSession(projectId, owner, { name: "chrome", version: "140" }).expect(HttpStatus.BAD_REQUEST);
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

        test("responds FAILED_PRECONDITION when nothing serves the requested execution substrate", async () => {
            const { owner, projectId } = await seedExecutingEnvironment(Execution.Emulator);

            // No sw:execution -> defaults to container, but the project only has an emulator environment.
            return createSession(projectId, owner).expect(HttpStatus.BAD_REQUEST);
        });

        // The node's failure surfaces as W3C "session not created" with the real cause — not as a
        // swallowed "no environments available" — and the reservation returns to the pool right away.
        test("surfaces the node's rejection as session-not-created and releases the reservation", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();
            createSessionOnNode.mockRejectedValue(new Error("node full"));

            await createSession(projectId, owner)
                .expect(HttpStatus.INTERNAL_SERVER_ERROR)
                .expect((response) => expect(JSON.stringify(response.body)).toMatch(/session not created.*node full/));

            const environment = await app.get(EnvironmentRepository).get(EnvironmentId.fromString(environmentId));
            expect(environment.occupancy).toBe(EnvironmentOccupancy.Free);
        });

        // A reservation held by another in-flight create hides the environment from the pool: with
        // nothing else free the shortage is the transient retryable conflict.
        test("responds CONFLICT while the only matching environment is reserved", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();
            await app.get(EnvironmentRepository).with(
                EnvironmentId.fromString(environmentId),
                (environment) => environment.reserve(new Date()),
            );

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

    // sw:environmentId targets one specific environment instead of pool allocation; matching is strict.
    // 400 = the request can never succeed there (wrong app), 404 = no such environment for the caller,
    // 409 = right target, wrong moment (still provisioning / busy).
    describe("POST /sessions (sw:environmentId targeting)", () => {
        test("opens the session on the targeted environment even when the pool prefers another", async () => {
            const { owner, projectId } = await seedProject();
            const olderId = await registerExecutingEnvironment(projectId, "139");
            await registerExecutingEnvironment(projectId, "141");

            const { body } = await createSession(
                projectId, owner, { name: "chrome", version: "latest" }, { environmentId: olderId },
            ).expect(HttpStatus.OK);

            expect(body.value.capabilities["sw:environmentId"]).toBe(olderId);
            expect(body.value.capabilities.browserVersion).toBe("139");
        });

        test("responds NOT_FOUND for an unknown environment", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();

            return createSession(projectId, owner, chrome, { environmentId: uuidv4() }).expect(HttpStatus.NOT_FOUND);
        });

        test("does not expose another project's environment (NOT_FOUND)", async () => {
            const { owner, projectId } = await seedExecutingEnvironment();
            const foreign = await seedExecutingEnvironment();

            return createSession(projectId, owner, chrome, { environmentId: foreign.environmentId })
                .expect(HttpStatus.NOT_FOUND);
        });

        test("responds BAD_REQUEST when the target lacks the requested application", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();

            return createSession(projectId, owner, { name: "firefox", version: "latest" }, { environmentId })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds BAD_REQUEST when the target offers a different exact version", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();

            return createSession(projectId, owner, { name: "chrome", version: "999" }, { environmentId })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds CONFLICT while the target is still provisioning", async () => {
            const { owner, projectId } = await seedProject();
            const environmentRepository = app.get(EnvironmentRepository);
            const enqueued = await environmentRepository.create({
                projectId: ProjectId.fromString(projectId),
                platform: Platform.fromObject({ name: "linux", version: "latest" }),
                applications: ApplicationList.fromObject([{ name: "chrome", version: chromeVersion }]),
            });

            return createSession(projectId, owner, chrome, { environmentId: enqueued.id })
                .expect(HttpStatus.CONFLICT);
        });

        test("surfaces the targeted node's rejection as session-not-created", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();
            createSessionOnNode.mockRejectedValue(new Error("node full"));

            return createSession(projectId, owner, chrome, { environmentId })
                .expect(HttpStatus.INTERNAL_SERVER_ERROR)
                .expect((response) => expect(JSON.stringify(response.body)).toMatch(/session not created/));
        });

        test("responds CONFLICT when the target is reserved by another in-flight create", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();
            await app.get(EnvironmentRepository).with(
                EnvironmentId.fromString(environmentId),
                (environment) => environment.reserve(new Date()),
            );

            return createSession(projectId, owner, chrome, { environmentId }).expect(HttpStatus.CONFLICT);
        });
    });

    // Ownership metadata (no secrets) lets the session's creator recover the live id later; a new
    // session on the same environment replaces the owner.
    describe("session ownership metadata", () => {
        const ownershipFor = (environmentId: string): Promise<SessionOwnership | null> =>
            app.get(SessionOwnershipRepository).findByEnvironment(EnvironmentId.fromString(environmentId));

        test("records who created the environment's current session", async () => {
            const externalId = UserFactory.createId();
            const projectRepository = app.get(ProjectRepository);
            const project = await projectRepository.create({
                name: `team-${externalId}`,
                createdBy: User.create({ externalId, providerType: "local" }),
            });
            await projectRepository.save(project);
            const environmentId = await registerExecutingEnvironment(project.id, chromeVersion);

            await createSession(project.id, Authorization.forUser(externalId)).expect(HttpStatus.OK);

            const ownership = await ownershipFor(environmentId);
            expect(ownership?.isOwnedBy(externalId)).toBe(true);
            expect(ownership?.isOwnedBy(UserFactory.createId())).toBe(false);
        });

        test("occupies the environment immediately, without waiting for a heartbeat", async () => {
            const { owner, projectId, environmentId } = await seedExecutingEnvironment();

            await createSession(projectId, owner).expect(HttpStatus.OK);

            const environment = await app.get(EnvironmentRepository).get(EnvironmentId.fromString(environmentId));
            expect(environment.occupancy).toBe(EnvironmentOccupancy.Busy);
            expect(environment.occupancyLastConfirmedAt).not.toBeNull();
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
