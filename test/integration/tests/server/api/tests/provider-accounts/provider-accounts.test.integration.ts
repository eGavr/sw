import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

const providerAccountBody = {
    provider: "docker",
    platform: "linux",
    execution: "container",
    config: { image: "registry/chrome:141" },
};

describe("/projects/:project/providerAccounts", () => {
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

    const seedProject = async (): Promise<{ ownerId: string, owner: AuthHeader, uid: string }> => {
        const ownerId = UserFactory.createId();
        const owner = Authorization.forUser(ownerId);

        return { ownerId, owner, uid: await createProject(owner) };
    };

    const create = (uid: string, auth: AuthHeader, body: object = providerAccountBody): request.Test =>
        request(app.getHttpServer()).post(`/projects/${uid}/providerAccounts`).set(auth).send(body);

    test("creates, reads, updates and soft-deletes a provider account", async () => {
        const { owner, uid } = await seedProject();

        const created = (await create(uid, owner).expect(HttpStatus.CREATED)).body;
        expect(created).toMatchObject({
            uid: expect.any(String),
            provider: "docker",
            platform: "linux",
            execution: "container",
            config: { image: "registry/chrome:141" },
            state: "active",
        });

        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/providerAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.providerAccounts.map((account: { uid: string }) => account.uid)).toContain(created.uid);

        const fetched = (await request(app.getHttpServer())
            .get(`/projects/${uid}/providerAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(fetched.uid).toBe(created.uid);

        const updated = (await request(app.getHttpServer())
            .patch(`/projects/${uid}/providerAccounts/${created.uid}`)
            .set(owner)
            .send({ config: { image: "registry/chrome:142" } })
            .expect(HttpStatus.OK)).body;
        expect(updated.config).toEqual({ image: "registry/chrome:142" });

        const deleted = (await request(app.getHttpServer())
            .delete(`/projects/${uid}/providerAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(deleted.state).toBe("disabled");

        // Soft delete: the resource is retained (still readable) with its disabled state.
        const afterDelete = (await request(app.getHttpServer())
            .get(`/projects/${uid}/providerAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(afterDelete.state).toBe("disabled");
    });

    test("rejects an unknown compute provider with INVALID_ARGUMENT", async () => {
        const { owner, uid } = await seedProject();

        return create(uid, owner, { ...providerAccountBody, provider: "wandering-cloud" }).expect(HttpStatus.BAD_REQUEST);
    });

    test("responds NOT_FOUND for an unknown provider account", async () => {
        const { owner, uid } = await seedProject();

        return request(app.getHttpServer())
            .get(`/projects/${uid}/providerAccounts/${uuidv4()}`).set(owner).expect(HttpStatus.NOT_FOUND);
    });

    test("does not expose a provider account of another project", async () => {
        const first = await seedProject();
        const second = await seedProject();
        const created = (await create(first.uid, first.owner).expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .get(`/projects/${second.uid}/providerAccounts/${created.uid}`).set(second.owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const { uid } = await seedProject();

        return request(app.getHttpServer())
            .post(`/projects/${uid}/providerAccounts`).send(providerAccountBody).expect(HttpStatus.UNAUTHORIZED);
    });

    test("responds PERMISSION_DENIED for a non-member", async () => {
        const { uid } = await seedProject();

        return create(uid, Authorization.forUser(UserFactory.createId())).expect(HttpStatus.FORBIDDEN);
    });

    test("responds PERMISSION_DENIED for a non-admin member (management is admin-only)", async () => {
        const { ownerId, owner, uid } = await seedProject();
        const developerId = UserFactory.createId();

        await request(app.getHttpServer())
            .post(`/projects/${uid}:setIamPolicy`)
            .set(owner)
            .send({
                policy: {
                    bindings: [
                        { role: "roles/admin", members: [`user:${ownerId}`] },
                        { role: "roles/developer", members: [`user:${developerId}`] },
                    ],
                },
            })
            .expect(HttpStatus.OK);

        return create(uid, Authorization.forUser(developerId)).expect(HttpStatus.FORBIDDEN);
    });
});
