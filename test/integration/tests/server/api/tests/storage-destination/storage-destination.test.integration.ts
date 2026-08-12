import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateAccountBody } from "../../utils/request/body/create-account-body";

type AuthHeader = { authorization: string };

const destinationBody = (overrides: object = {}): Record<string, unknown> => ({
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    bucket: "my-logs",
    prefix: "sessions",
    ...overrides,
});

describe("/accounts/:account/storageDestination", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const createAccount = async (owner: AuthHeader): Promise<string> => {
        const { body } = await request(app.getHttpServer())
            .post("/accounts")
            .set(owner)
            .send(CreateAccountBody.create())
            .expect(HttpStatus.CREATED);

        return body.uid;
    };

    const path = (account: string): string => `/accounts/${account}/storageDestination`;

    test("responds NOT_FOUND before it is configured", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const account = await createAccount(owner);

        return request(app.getHttpServer())
            .get(path(account))
            .set(owner)
            .expect(HttpStatus.NOT_FOUND)
            .expect((response) => expect(response.body.error.status).toBe("NOT_FOUND"));
    });

    test("PATCH registers the location and Get returns it", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const account = await createAccount(owner);

        const set = await request(app.getHttpServer())
            .patch(path(account))
            .set(owner)
            .send(destinationBody())
            .expect(HttpStatus.OK);

        expect(set.body).toEqual({
            name: `accounts/${account}/storageDestination`,
            endpoint: "https://storage.yandexcloud.net",
            region: "ru-central1",
            bucket: "my-logs",
            prefix: "sessions",
        });

        const get = await request(app.getHttpServer()).get(path(account)).set(owner).expect(HttpStatus.OK);

        expect(get.body).toEqual(set.body);
    });

    test("PATCH replaces an existing destination", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const account = await createAccount(owner);

        await request(app.getHttpServer()).patch(path(account)).set(owner).send(destinationBody()).expect(HttpStatus.OK);
        await request(app.getHttpServer())
            .patch(path(account))
            .set(owner)
            .send(destinationBody({ bucket: "other-logs" }))
            .expect(HttpStatus.OK);

        const get = await request(app.getHttpServer()).get(path(account)).set(owner).expect(HttpStatus.OK);

        expect(get.body.bucket).toBe("other-logs");
    });

    test("responds INVALID_ARGUMENT when bucket is missing", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const account = await createAccount(owner);

        return request(app.getHttpServer())
            .patch(path(account))
            .set(owner)
            .send(destinationBody({ bucket: undefined }))
            .expect(HttpStatus.BAD_REQUEST)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const account = await createAccount(owner);

        return request(app.getHttpServer()).get(path(account)).expect(HttpStatus.UNAUTHORIZED);
    });

    test("responds PERMISSION_DENIED to a non-owner", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const stranger = Authorization.forUser(UserFactory.createId());
        const account = await createAccount(owner);

        await request(app.getHttpServer())
            .patch(path(account))
            .set(stranger)
            .send(destinationBody())
            .expect(HttpStatus.FORBIDDEN)
            .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));

        return request(app.getHttpServer()).get(path(account)).set(stranger).expect(HttpStatus.FORBIDDEN);
    });
});
