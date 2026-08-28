import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

describe("/projects/:project/cloudAccounts", () => {
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

    const connect = (uid: string, auth: AuthHeader, type: string): request.Test =>
        request(app.getHttpServer()).post(`/projects/${uid}/cloudAccounts`).set(auth).send({ type });

    test("connects a cloud, materialises its provided substrates, and lists it", async () => {
        const { owner, uid } = await seedProject();

        const created = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        expect(created).toMatchObject({ uid: expect.any(String), type: "yandex-cloud", state: "active" });
        expect(created.provides).toEqual([{ platform: "android", execution: "container" }]);

        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.cloudAccounts.map((account: { type: string }) => account.type)).toContain("yandex-cloud");
    });

    test("gets and soft-deletes a cloud account", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        const fetched = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(fetched.uid).toBe(created.uid);

        const deleted = (await request(app.getHttpServer())
            .delete(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(deleted.state).toBe("disabled");

        // Soft delete: still readable by id, disabled...
        const afterDelete = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(afterDelete.state).toBe("disabled");

        // ...but omitted from the listing (AIP-135), so a reconnect of the same type is possible.
        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.cloudAccounts).toEqual([]);
        await connect(uid, owner, "local").expect(HttpStatus.CREATED);
    });

    test("does not expose a cloud account of another project", async () => {
        const first = await seedProject();
        const second = await seedProject();
        const created = (await connect(first.uid, first.owner, "local").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .get(`/projects/${second.uid}/cloudAccounts/${created.uid}`).set(second.owner).expect(HttpStatus.NOT_FOUND);
    });

    test("allows clouds with disjoint substrates but rejects an overlapping one (CONFLICT)", async () => {
        const { owner, uid } = await seedProject();

        // yandex-cloud (android/*) and local (linux/container) do not overlap.
        await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED);
        await connect(uid, owner, "local").expect(HttpStatus.CREATED);

        // A second local provides the same linux/container -> overlaps the first -> rejected.
        return connect(uid, owner, "local").expect(HttpStatus.CONFLICT);
    });

    test("rejects an unknown cloud type with INVALID_ARGUMENT", async () => {
        const { owner, uid } = await seedProject();

        return connect(uid, owner, "wandering-cloud").expect(HttpStatus.BAD_REQUEST);
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const { uid } = await seedProject();

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).send({ type: "local" }).expect(HttpStatus.UNAUTHORIZED);
    });

    test("responds PERMISSION_DENIED for a non-member", async () => {
        const { uid } = await seedProject();

        return connect(uid, Authorization.forUser(UserFactory.createId()), "local").expect(HttpStatus.FORBIDDEN);
    });
});
