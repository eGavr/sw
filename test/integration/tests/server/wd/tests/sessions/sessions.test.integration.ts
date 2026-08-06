import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { AccountRepository } from "../../../../../../../src/application/interfaces/repositories/account-repository";
import { EnvironmentRepository } from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    ProviderAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/provider-account-repository";
import { AccountId } from "../../../../../../../src/domain/entities/account/account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProviderAccountId } from "../../../../../../../src/domain/entities/provider-account/provider-account-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { SessionRoute } from "../../../../../../../src/presentation/http/wd/session-route";
import { WdModule } from "../../../../../../../src/presentation/http/wd/wd-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

type AuthHeader = { authorization: string };

const chrome = { name: "chrome", version: "latest" };

describe("/sessions", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(WdModule);
    });

    afterEach(async () => {
        await app.close();
    });

    // Seed (in the app's own DI/compute) an account whose owner holds session:create and a Local
    // environment offering Chrome, so create-session can be exercised without a real browser.
    const seedOwnedEnvironment = async (): Promise<{ owner: AuthHeader, environmentId: string }> => {
        const externalId = UserFactory.createId();
        const accountRepository = app.app.get(AccountRepository);
        const providerAccountRepository = app.app.get(ProviderAccountRepository);
        const environmentRepository = app.app.get(EnvironmentRepository);

        const account = await accountRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await accountRepository.save(account);

        const providerAccount = await providerAccountRepository.create({
            accountId: AccountId.fromString(account.id),
            providerType: "local",
        });

        const environment = await environmentRepository.create({
            accountId: AccountId.fromString(account.id),
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return { owner: Authorization.forUser(externalId), environmentId: environment.id };
    };

    const createSession = (environmentId: string, auth: AuthHeader): request.Test =>
        request(app.getHttpServer()).post("/sessions").set(auth).send({ environmentId, application: chrome });

    describe("POST /sessions (create)", () => {
        test("responds UNAUTHORIZED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .post("/sessions")
                .send({ environmentId: uuidv4(), application: chrome })
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds UNAUTHORIZED for an invalid token", () => {
            return request(app.getHttpServer())
                .post("/sessions")
                .set(Authorization.invalidToken)
                .send({ environmentId: uuidv4(), application: chrome })
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("lets the owner create a session", async () => {
            const { owner, environmentId } = await seedOwnedEnvironment();

            const { body } = await createSession(environmentId, owner).expect(HttpStatus.CREATED);

            expect(body.id).toEqual(expect.any(String));
            expect(body.environmentId).toBe(environmentId);
            expect(body.application).toEqual({ name: "chrome", version: "latest" });
        });

        test("responds FORBIDDEN for a non-owner (no session:create)", async () => {
            const { environmentId } = await seedOwnedEnvironment();
            const stranger = Authorization.forUser(UserFactory.createId());

            return createSession(environmentId, stranger).expect(HttpStatus.FORBIDDEN);
        });

        test("responds NOT_FOUND for a non-existent environment", () => {
            return createSession(uuidv4(), Authorization.forUser(UserFactory.createId())).expect(HttpStatus.NOT_FOUND);
        });

        test("responds CONFLICT for a second active session in the same environment", async () => {
            const { owner, environmentId } = await seedOwnedEnvironment();

            await createSession(environmentId, owner).expect(HttpStatus.CREATED);

            return createSession(environmentId, owner).expect(HttpStatus.CONFLICT);
        });

        test("responds BAD_REQUEST for an application the environment does not offer", async () => {
            const { owner, environmentId } = await seedOwnedEnvironment();

            return request(app.getHttpServer())
                .post("/sessions")
                .set(owner)
                .send({ environmentId, application: { name: "firefox", version: "latest" } })
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
