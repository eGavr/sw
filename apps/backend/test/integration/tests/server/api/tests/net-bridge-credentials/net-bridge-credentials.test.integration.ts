import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

describe("/projects/:project/netBridgeCredentials", () => {
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

    const path = (project: string): string => `/projects/${project}/netBridgeCredentials`;

    test("Create mints a credential and returns the plaintext secret exactly once", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        const created = await request(app.getHttpServer())
            .post(path(project))
            .set(owner)
            .send({ name: "ci-key" })
            .expect(HttpStatus.CREATED);

        expect(created.body.name).toBe(`projects/${project}/netBridgeCredentials/${created.body.uid}`);
        expect(created.body.displayName).toBe("ci-key");
        expect(created.body.secret).toMatch(/^swnb_/);
        expect(typeof created.body.createTime).toBe("string");
    });

    test("List returns created credentials as metadata, never the secret or its hash", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        const created = await request(app.getHttpServer())
            .post(path(project))
            .set(owner)
            .send({ name: "ci-key" })
            .expect(HttpStatus.CREATED);

        const list = await request(app.getHttpServer()).get(path(project)).set(owner).expect(HttpStatus.OK);

        expect(list.body.netBridgeCredentials).toHaveLength(1);

        const [item] = list.body.netBridgeCredentials;

        expect(item.uid).toBe(created.body.uid);
        expect(item.displayName).toBe("ci-key");
        expect(item.secret).toBeUndefined();
        expect(item.secretHash).toBeUndefined();
    });

    test("Get returns one credential as metadata, without the secret", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        const created = await request(app.getHttpServer())
            .post(path(project))
            .set(owner)
            .send({})
            .expect(HttpStatus.CREATED);

        const got = await request(app.getHttpServer())
            .get(`${path(project)}/${created.body.uid}`)
            .set(owner)
            .expect(HttpStatus.OK);

        expect(got.body.uid).toBe(created.body.uid);
        expect(got.body.secret).toBeUndefined();
    });

    test("Delete revokes the credential — Get is NOT_FOUND afterwards", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        const created = await request(app.getHttpServer())
            .post(path(project))
            .set(owner)
            .send({})
            .expect(HttpStatus.CREATED);

        await request(app.getHttpServer())
            .delete(`${path(project)}/${created.body.uid}`)
            .set(owner)
            .expect(HttpStatus.NO_CONTENT);

        await request(app.getHttpServer())
            .get(`${path(project)}/${created.body.uid}`)
            .set(owner)
            .expect(HttpStatus.NOT_FOUND);
    });

    test("Create accepts an expiry and echoes it back", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);
        const expireTime = "2099-01-01T00:00:00.000Z";

        const created = await request(app.getHttpServer())
            .post(path(project))
            .set(owner)
            .send({ expireTime })
            .expect(HttpStatus.CREATED);

        expect(created.body.expireTime).toBe(expireTime);
    });

    test("responds INVALID_ARGUMENT for a malformed expiry", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const project = await createProject(owner);

        return request(app.getHttpServer())
            .post(path(project))
            .set(owner)
            .send({ expireTime: "not-a-date" })
            .expect(HttpStatus.BAD_REQUEST);
    });

    test("does not address another project's credential (cross-project isolation)", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const projectA = await createProject(owner);
        const projectB = await createProject(owner);

        const created = await request(app.getHttpServer())
            .post(path(projectA))
            .set(owner)
            .send({})
            .expect(HttpStatus.CREATED);

        await request(app.getHttpServer())
            .get(`${path(projectB)}/${created.body.uid}`)
            .set(owner)
            .expect(HttpStatus.NOT_FOUND);
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
            .post(path(project))
            .set(stranger)
            .send({})
            .expect(HttpStatus.FORBIDDEN)
            .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));

        return request(app.getHttpServer()).get(path(project)).set(stranger).expect(HttpStatus.FORBIDDEN);
    });
});
