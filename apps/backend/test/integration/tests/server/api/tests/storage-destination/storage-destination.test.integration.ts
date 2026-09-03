import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ObjectStorageGateway } from "../../../../../../../src/application/interfaces/gateways/object-storage-gateway";
import { StorageDestination } from "../../../../../../../src/domain/entities/storage/storage-destination";
import { OwnershipMarker } from "../../../../../../../src/domain/entities/verification/ownership-marker";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

// Simulates the bucket owner placing the ownership marker (the app only ever reads it). Seeded into the
// in-memory object storage the app uses, so :test / logging see it exactly as they would in a real bucket.
const placeOwnershipMarker = async (app: TestingApp, projectId: string, bucket: string): Promise<void> => {
    const storage = app.app.get<ObjectStorageGateway>(ObjectStorageGateway);
    const marker = OwnershipMarker.forProject(projectId);

    await storage.put(StorageDestination.create({ bucket }), marker.objectKey(), { body: Buffer.from("sw") });
};

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

    test("test-probe succeeds against a configured, ownership-verified destination (in-memory write)", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        await request(app.getHttpServer()).patch(path(project)).set(owner).send(destinationBody()).expect(HttpStatus.OK);
        // The bucket carries this project's ownership marker (placed by its owner) — otherwise :test would
        // report the bucket as not ownership-verified.
        await placeOwnershipMarker(app, project, "my-logs");

        const probe = await request(app.getHttpServer()).post(`${path(project)}:test`).set(owner).expect(HttpStatus.OK);

        expect(probe.body).toEqual({ ok: true });
    });

    test("test-probe reports a bucket without the ownership marker as not verified", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        await request(app.getHttpServer()).patch(path(project)).set(owner).send(destinationBody()).expect(HttpStatus.OK);

        const probe = await request(app.getHttpServer()).post(`${path(project)}:test`).set(owner).expect(HttpStatus.OK);

        expect(probe.body.ok).toBe(false);
    });

    test("test-probe is NOT_FOUND when no destination is configured", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer()).post(`${path(project)}:test`).set(owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds INVALID_ARGUMENT for a malformed bucket (uppercase/spaces)", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer())
            .patch(path(project))
            .set(owner)
            .send(destinationBody({ bucket: "Not A Bucket!" }))
            .expect(HttpStatus.BAD_REQUEST)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds INVALID_ARGUMENT for a non-URL endpoint", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer())
            .patch(path(project))
            .set(owner)
            .send(destinationBody({ endpoint: "not-a-url" }))
            .expect(HttpStatus.BAD_REQUEST);
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
