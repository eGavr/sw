import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { ApiModule } from "../../../../../../../src/presentation/server/nestjs/modules/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateAccountBody } from "../../utils/request/body/create-account-body";

const validEnvironmentBody = {
    platform: { name: "linux", version: "latest" },
    applications: [{ name: "chrome", version: "latest" }],
};

describe("/accounts/:account/environments", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    // The owner of a fresh account holds every environment permission (grant-all on creation).
    const createAccount = async (): Promise<{ owner: { authorization: string }, accountId: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const { body } = await request(app.getHttpServer())
            .post("/accounts")
            .set(owner)
            .send(CreateAccountBody.create())
            .expect(HttpStatus.CREATED);

        return { owner, accountId: body.uid };
    };

    const createEnvironment = (accountId: string, owner: { authorization: string }): request.Test =>
        request(app.getHttpServer()).post(`/accounts/${accountId}/environments`).set(owner).send(validEnvironmentBody);

    describe("POST (create)", () => {
        test("lets the owner create a Local environment as an AIP resource", async () => {
            const { owner, accountId } = await createAccount();

            const { body } = await createEnvironment(accountId, owner).expect(HttpStatus.CREATED);

            expect(body).toEqual({
                name: `accounts/${accountId}/environments/${body.uid}`,
                uid: expect.any(String),
                state: "ENQUEUED",
                platform: { name: "linux", version: "latest", deviceModel: "linux" },
                applications: [{ name: "chrome", version: "latest" }],
                createTime: expect.any(String),
            });
        });

        test("responds UNAUTHENTICATED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .post(`/accounts/${uuidv4()}/environments`)
                .send(validEnvironmentBody)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds PERMISSION_DENIED for a non-owner", async () => {
            const { accountId } = await createAccount();
            const stranger = Authorization.forUser(UserFactory.createId());

            return createEnvironment(accountId, stranger)
                .expect(HttpStatus.FORBIDDEN)
                .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));
        });

        test("responds INVALID_ARGUMENT for an invalid body", async () => {
            const { owner, accountId } = await createAccount();

            return request(app.getHttpServer())
                .post(`/accounts/${accountId}/environments`)
                .set(owner)
                .send({})
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds NOT_FOUND for a non-existent account", () => {
            return request(app.getHttpServer())
                .post(`/accounts/${uuidv4()}/environments`)
                .set(Authorization.forUser(UserFactory.createId()))
                .send(validEnvironmentBody)
                .expect(HttpStatus.NOT_FOUND);
        });
    });

    describe("lifecycle (create -> get -> list -> delete)", () => {
        test("creates enqueued, reads, lists and deletes an environment (state-based)", async () => {
            const { owner, accountId } = await createAccount();

            const { body: environment } = await createEnvironment(accountId, owner).expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .get(`/accounts/${accountId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK)
                .expect((response) => {
                    expect(response.body.uid).toBe(environment.uid);
                    expect(response.body.state).toBe("ENQUEUED");
                });

            const list = await request(app.getHttpServer())
                .get(`/accounts/${accountId}/environments`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(list.body.environments).toHaveLength(1);
            expect(list.body.environments[0].uid).toBe(environment.uid);

            await request(app.getHttpServer())
                .delete(`/accounts/${accountId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK, {});

            // Delete is async/state-based: the row survives (GC removes it later); GET derives DELETED.
            await request(app.getHttpServer())
                .get(`/accounts/${accountId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK)
                .expect((response) => expect(response.body.state).toBe("DELETED"));
        });
    });

    // get/delete look the environment up before touching the account, so id/existence errors precede authz.
    describe("GET /:environment (errors)", () => {
        test("responds UNAUTHENTICATED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .get(`/accounts/${uuidv4()}/environments/${uuidv4()}`)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds UNAUTHENTICATED for an invalid token", () => {
            return request(app.getHttpServer())
                .get(`/accounts/${uuidv4()}/environments/${uuidv4()}`)
                .set(Authorization.invalidToken)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds INVALID_ARGUMENT for a malformed environment id", () => {
            return request(app.getHttpServer())
                .get(`/accounts/${uuidv4()}/environments/not-a-uuid`)
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds NOT_FOUND for a non-existent environment", () => {
            return request(app.getHttpServer())
                .get(`/accounts/${uuidv4()}/environments/${uuidv4()}`)
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
