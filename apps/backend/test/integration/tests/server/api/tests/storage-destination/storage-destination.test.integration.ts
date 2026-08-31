import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

const destinationBody = (overrides: object = {}): Record<string, unknown> => ({
    endpoint: "https://storage.yandexcloud.net",
    region: "ru-central1",
    bucket: "my-logs",
    prefix: "sessions",
    ...overrides,
});

describe("/projects/:project/storageDestination", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const createProject = async (owner: AuthHeader): Promise<string> => {
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(owner)
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        return body.uid;
    };

    const path = (project: string): string => `/projects/${project}/storageDestination`;

    test("responds NOT_FOUND before it is configured", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer())
            .get(path(project))
            .set(owner)
            .expect(HttpStatus.NOT_FOUND)
            .expect((response) => expect(response.body.error.status).toBe("NOT_FOUND"));
    });

    test("PATCH registers the location and Get returns it", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        const set = await request(app.getHttpServer())
            .patch(path(project))
            .set(owner)
            .send(destinationBody())
            .expect(HttpStatus.OK);

        expect(set.body).toEqual({
            name: `projects/${project}/storageDestination`,
            endpoint: "https://storage.yandexcloud.net",
            region: "ru-central1",
            bucket: "my-logs",
            prefix: "sessions",
        });

        const get = await request(app.getHttpServer()).get(path(project)).set(owner).expect(HttpStatus.OK);

        expect(get.body).toEqual(set.body);
    });

    test("DELETE clears the destination — Get is NOT_FOUND again", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        await request(app.getHttpServer()).patch(path(project)).set(owner).send(destinationBody()).expect(HttpStatus.OK);
        await request(app.getHttpServer()).delete(path(project)).set(owner).expect(HttpStatus.NO_CONTENT);

        await request(app.getHttpServer()).get(path(project)).set(owner).expect(HttpStatus.NOT_FOUND);
    });

    test("DELETE is idempotent — clearing an unconfigured destination is fine", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        await request(app.getHttpServer()).delete(path(project)).set(owner).expect(HttpStatus.NO_CONTENT);
    });

    test("PATCH replaces an existing destination", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        await request(app.getHttpServer()).patch(path(project)).set(owner).send(destinationBody()).expect(HttpStatus.OK);
        await request(app.getHttpServer())
            .patch(path(project))
            .set(owner)
            .send(destinationBody({ bucket: "other-logs" }))
            .expect(HttpStatus.OK);

        const get = await request(app.getHttpServer()).get(path(project)).set(owner).expect(HttpStatus.OK);

        expect(get.body.bucket).toBe("other-logs");
    });

    test("responds INVALID_ARGUMENT when bucket is missing", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer())
            .patch(path(project))
            .set(owner)
            .send(destinationBody({ bucket: undefined }))
            .expect(HttpStatus.BAD_REQUEST)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer()).get(path(project)).expect(HttpStatus.UNAUTHORIZED);
    });

    test("responds PERMISSION_DENIED to a non-owner", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const stranger = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        await request(app.getHttpServer())
            .patch(path(project))
            .set(stranger)
            .send(destinationBody())
            .expect(HttpStatus.FORBIDDEN)
            .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));

        return request(app.getHttpServer()).get(path(project)).set(stranger).expect(HttpStatus.FORBIDDEN);
    });
});
