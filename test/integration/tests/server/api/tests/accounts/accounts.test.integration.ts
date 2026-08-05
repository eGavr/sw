import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { UserPermissionList } from "../../../../../../../src/domain/entities/user/user-permission-list";
import { ApiModule } from "../../../../../../../src/presentation/server/nestjs/modules/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateAccountBody } from "../../utils/request/body/create-account-body";

type AuthHeader = { authorization: string };

describe("/accounts", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const createAccount = async (
        owner: AuthHeader = Authorization.forUser(UserFactory.createId()),
    ): Promise<{ owner: AuthHeader, uid: string }> => {
        const { body } = await request(app.getHttpServer())
            .post("/accounts")
            .set(owner)
            .send(CreateAccountBody.create())
            .expect(HttpStatus.CREATED);

        return { owner, uid: body.uid };
    };

    describe("POST /accounts", () => {
        test("responds UNAUTHENTICATED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create())
                .expect(HttpStatus.UNAUTHORIZED)
                .expect((response) => expect(response.body.error.status).toBe("UNAUTHENTICATED"));
        });

        test("responds UNAUTHENTICATED for an invalid token", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .set(Authorization.invalidToken)
                .send(CreateAccountBody.create())
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds INVALID_ARGUMENT when displayName has the wrong type", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .set(Authorization.forUser(UserFactory.createId()))
                .send(CreateAccountBody.create({ displayName: 12345 }))
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
        });

        test("responds INVALID_ARGUMENT when displayName violates the domain rule", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .set(Authorization.forUser(UserFactory.createId()))
                .send(CreateAccountBody.create({ displayName: "not a valid name!" }))
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.message).toMatch(/account name/));
        });

        test("is self-service: any authenticated user creates an account and gets an AIP resource", async () => {
            const { body } = await request(app.getHttpServer())
                .post("/accounts")
                .set(Authorization.forUser(UserFactory.createId()))
                .send({ displayName: "team-a", resources: { providerId: "p", providerType: "local" } })
                .expect(HttpStatus.CREATED);

            expect(body).toEqual({
                name: `accounts/${body.uid}`,
                uid: expect.any(String),
                displayName: "team-a",
                createTime: expect.any(String),
                updateTime: expect.any(String),
                resources: { providerId: "p", providerType: "local" },
            });
        });

        test("supports creating multiple accounts for one user", async () => {
            const owner = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer()).post("/accounts").set(owner).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/accounts").set(owner).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);
        });
    });

    describe("GET /accounts", () => {
        test("lists only the caller's own accounts", async () => {
            const alice = Authorization.forUser(UserFactory.createId());
            const bob = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer()).post("/accounts").set(alice).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/accounts").set(alice).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/accounts").set(bob).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);

            const { body } = await request(app.getHttpServer()).get("/accounts").set(alice).expect(HttpStatus.OK);

            expect(body.accounts).toHaveLength(2);
        });

        test("paginates with pageSize and an opaque nextPageToken", async () => {
            const alice = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer()).post("/accounts").set(alice).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/accounts").set(alice).send(CreateAccountBody.create()).expect(HttpStatus.CREATED);

            const first = await request(app.getHttpServer()).get("/accounts?pageSize=1").set(alice).expect(HttpStatus.OK);

            expect(first.body.accounts).toHaveLength(1);
            expect(first.body.nextPageToken).toEqual(expect.any(String));

            const second = await request(app.getHttpServer())
                .get(`/accounts?pageSize=1&pageToken=${first.body.nextPageToken}`)
                .set(alice)
                .expect(HttpStatus.OK);

            expect(second.body.accounts).toHaveLength(1);
            expect(second.body.accounts[0].uid).not.toBe(first.body.accounts[0].uid);
        });
    });

    describe("GET /accounts/:account", () => {
        test("lets the owner read the account", async () => {
            const { owner, uid } = await createAccount();

            const { body } = await request(app.getHttpServer()).get(`/accounts/${uid}`).set(owner).expect(HttpStatus.OK);

            expect(body.uid).toBe(uid);
            expect(body.name).toBe(`accounts/${uid}`);
        });

        test("responds PERMISSION_DENIED for a non-owner", async () => {
            const { uid } = await createAccount();
            const stranger = Authorization.forUser(UserFactory.createId());

            return request(app.getHttpServer())
                .get(`/accounts/${uid}`)
                .set(stranger)
                .expect(HttpStatus.FORBIDDEN)
                .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));
        });

        test("responds NOT_FOUND for a non-existent account", () => {
            return request(app.getHttpServer())
                .get(`/accounts/${uuidv4()}`)
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.NOT_FOUND);
        });

        test("responds INVALID_ARGUMENT for a malformed account id", () => {
            return request(app.getHttpServer())
                .get("/accounts/not-a-uuid")
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.BAD_REQUEST);
        });
    });

    describe("POST /accounts/:account:testIamPermissions", () => {
        test("returns the held subset of the requested permissions for the owner", async () => {
            const { owner, uid } = await createAccount();

            const { body } = await request(app.getHttpServer())
                .post(`/accounts/${uid}:testIamPermissions`)
                .set(owner)
                .send({ permissions: ["environment:create", "account:read"] })
                .expect(HttpStatus.OK);

            expect(body).toEqual({ permissions: ["environment:create", "account:read"] });
        });

        test("grants the owner every permission after account creation", async () => {
            const { owner, uid } = await createAccount();
            const permissions = UserPermissionList.getAll().toArray().map((permission) => permission.name);

            const { body } = await request(app.getHttpServer())
                .post(`/accounts/${uid}:testIamPermissions`)
                .set(owner)
                .send({ permissions })
                .expect(HttpStatus.OK);

            expect(body.permissions.sort()).toEqual([...permissions].sort());
        });

        test("returns an empty set for a user who holds none", async () => {
            const { uid } = await createAccount();
            const stranger = Authorization.forUser(UserFactory.createId());

            return request(app.getHttpServer())
                .post(`/accounts/${uid}:testIamPermissions`)
                .set(stranger)
                .send({ permissions: ["environment:create", "account:read"] })
                .expect(HttpStatus.OK, { permissions: [] });
        });

        test("responds INVALID_ARGUMENT for an unknown permission", async () => {
            const { owner, uid } = await createAccount();

            return request(app.getHttpServer())
                .post(`/accounts/${uid}:testIamPermissions`)
                .set(owner)
                .send({ permissions: ["environment:teleport"] })
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
        });

        test("responds NOT_FOUND for an unknown custom verb", async () => {
            const { owner, uid } = await createAccount();

            return request(app.getHttpServer())
                .post(`/accounts/${uid}:doSomethingElse`)
                .set(owner)
                .send({ permissions: ["account:read"] })
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
