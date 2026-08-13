import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    WebDriverSessionGateway,
} from "../../../../../../../src/application/interfaces/gateways/webdriver-session-gateway";
import { AccountRepository } from "../../../../../../../src/application/interfaces/repositories/account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { AccountId } from "../../../../../../../src/domain/entities/account/account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { SessionRoute } from "../../../../../../../src/presentation/http/wd/session-route";
import { WdModule } from "../../../../../../../src/presentation/http/wd/wd-module";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

type AuthHeader = { authorization: string };

const chrome = { name: "chrome", version: "latest" };
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

    // A fresh account's owner holds every permission (grant-all on creation), so it may create sessions.
    const seedAccount = async (): Promise<{ owner: AuthHeader, accountId: string }> => {
        const externalId = UserFactory.createId();
        const accountRepository = app.get(AccountRepository);

        const account = await accountRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await accountRepository.save(account);

        return { owner: Authorization.forUser(externalId), accountId: account.id };
    };

    // enqueued -> starting -> preparing -> executing (endpoint + fresh heartbeat), so it is allocatable.
    const seedExecutingEnvironment = async (): Promise<{ owner: AuthHeader, accountId: string, environmentId: string }> => {
        const { owner, accountId } = await seedAccount();
        const environmentRepository = app.get(EnvironmentRepository);

        await environmentRepository.create({
            accountId: AccountId.fromString(accountId),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        claimed.register(new EnvironmentEndpoint(nodeEndpoint), new Date());
        await environmentRepository.save(claimed);

        return { owner, accountId, environmentId: claimed.id };
    };

    type SessionOpts = { logging?: boolean, video?: boolean };
    type ApplicationCaps = { name: string, version: string };

    // W3C "New Session" request: the requested application is the standard browserName/browserVersion,
    // our per-session opt-ins ride as vendor sw:* capabilities, and the account is sw:accountId.
    const capabilities = (accountId: string, application: ApplicationCaps, opts: SessionOpts = {}): object => ({
        capabilities: {
            alwaysMatch: {
                browserName: application.name,
                browserVersion: application.version,
                "sw:accountId": accountId,
                ...(opts.logging === undefined ? {} : { "sw:logging": opts.logging }),
                ...(opts.video === undefined ? {} : { "sw:video": opts.video }),
            },
        },
    });

    const createSession = (
        accountId: string,
        auth: AuthHeader,
        application: ApplicationCaps = chrome,
        opts: SessionOpts = {},
    ): request.Test =>
        request(app.getHttpServer()).post("/sessions").set(auth).send(capabilities(accountId, application, opts));

    describe("POST /sessions (allocate)", () => {
        test("allocates a free matching environment and returns an id routed to its node", async () => {
            const { owner, accountId, environmentId } = await seedExecutingEnvironment();

            // W3C New Session-shaped response: { value: { sessionId, capabilities } }.
            const { body } = await createSession(accountId, owner).expect(HttpStatus.OK);
            const caps = body.value.capabilities;

            expect(caps["sw:environmentId"]).toBe(environmentId);
            expect(caps.browserName).toBe("chrome");
            expect(caps.browserVersion).toBe("latest");
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
            const { owner, accountId } = await seedExecutingEnvironment();

            await createSession(accountId, owner, chrome, { logging: true }).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(nodeEndpoint, expect.anything(), { logging: true, video: false });
        });

        test("threads the video opt-in through to the node session", async () => {
            const { owner, accountId } = await seedExecutingEnvironment();

            await createSession(accountId, owner, chrome, { video: true }).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(nodeEndpoint, expect.anything(), { logging: false, video: true });
        });

        test("defaults the logging and video opt-ins to false when omitted", async () => {
            const { owner, accountId } = await seedExecutingEnvironment();

            await createSession(accountId, owner).expect(HttpStatus.OK);

            expect(createSessionOnNode).toHaveBeenCalledWith(nodeEndpoint, expect.anything(), { logging: false, video: false });
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
            const { accountId } = await seedExecutingEnvironment();
            const stranger = Authorization.forUser(UserFactory.createId());

            return createSession(accountId, stranger).expect(HttpStatus.FORBIDDEN);
        });

        test("responds NOT_FOUND for a non-existent account", () => {
            return createSession(uuidv4(), Authorization.forUser(UserFactory.createId())).expect(HttpStatus.NOT_FOUND);
        });

        test("responds CONFLICT when the account has no free matching environment", async () => {
            const { owner, accountId } = await seedAccount();

            return createSession(accountId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds CONFLICT when no environment offers the requested application", async () => {
            const { owner, accountId } = await seedExecutingEnvironment();

            return createSession(accountId, owner, { name: "firefox", version: "latest" }).expect(HttpStatus.CONFLICT);
        });

        test("responds CONFLICT when the node rejects the session (busy)", async () => {
            const { owner, accountId } = await seedExecutingEnvironment();
            createSessionOnNode.mockRejectedValue(new Error("node full"));

            return createSession(accountId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds BAD_REQUEST for a non-W3C request body (no capabilities envelope)", async () => {
            const { owner, accountId } = await seedExecutingEnvironment();

            return request(app.getHttpServer())
                .post("/sessions")
                .set(owner)
                .send({ accountId, application: chrome })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds BAD_REQUEST when a required capability is missing (no sw:accountId)", async () => {
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
