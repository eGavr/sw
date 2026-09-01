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

    // yandex-cloud is delegated BYOC and requires the target folder; the helper supplies a stub one.
    const connect = (uid: string, auth: AuthHeader, type: string): request.Test =>
        request(app.getHttpServer()).post(`/projects/${uid}/cloudAccounts`).set(auth)
            .send(type === "yandex-cloud" ? { type, config: { folderId: "b1gstub" } } : { type });

    test("connects a cloud, materialises its provided substrates, and lists it", async () => {
        const { owner, uid } = await seedProject();

        const created = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        expect(created).toMatchObject({ uid: expect.any(String), type: "yandex-cloud" });
        expect(created.provides).toEqual([
            { platform: "android", execution: "container" },
            { platform: "linux", execution: "container" },
        ]);

        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.cloudAccounts.map((account: { type: string }) => account.type)).toContain("yandex-cloud");
    });

    test("gets and deletes a cloud account for real, allowing a reconnect", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        const fetched = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(fetched.uid).toBe(created.uid);

        await request(app.getHttpServer())
            .delete(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK);

        // Gone for real: unreadable, unlisted — and the same type can be connected again.
        await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.NOT_FOUND);
        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.cloudAccounts).toEqual([]);
        await connect(uid, owner, "local").expect(HttpStatus.CREATED);
    });

    test("refuses to delete a cloud account still referenced by an environment (CONFLICT)", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        await request(app.getHttpServer())
            .post(`/projects/${uid}/environments`)
            .set(owner)
            .send({
                platform: { name: "linux", version: "1" },
                applications: [{ name: "chrome", version: "128" }],
            })
            .expect(HttpStatus.CREATED);

        return request(app.getHttpServer())
            .delete(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.CONFLICT);
    });

    test("does not expose a cloud account of another project", async () => {
        const first = await seedProject();
        const second = await seedProject();
        const created = (await connect(first.uid, first.owner, "local").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .get(`/projects/${second.uid}/cloudAccounts/${created.uid}`).set(second.owner).expect(HttpStatus.NOT_FOUND);
    });

    test("rejects a cloud whose substrates overlap an already-connected one (CONFLICT)", async () => {
        const { owner, uid } = await seedProject();

        await connect(uid, owner, "local").expect(HttpStatus.CREATED);

        // Both yandex-cloud and a second local provide linux/container -> routing would be ambiguous.
        await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CONFLICT);

        return connect(uid, owner, "local").expect(HttpStatus.CONFLICT);
    });

    test("rejects a delegated cloud without its required folder (INVALID_ARGUMENT)", async () => {
        const { owner, uid } = await seedProject();

        await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner)
            .send({ type: "yandex-cloud" }).expect(HttpStatus.BAD_REQUEST);

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner)
            .send({ type: "yandex-cloud", config: { folderId: "" } }).expect(HttpStatus.BAD_REQUEST);
    });

    test("rejects an unknown cloud type with INVALID_ARGUMENT", async () => {
        const { owner, uid } = await seedProject();

        return connect(uid, owner, "wandering-cloud").expect(HttpStatus.BAD_REQUEST);
    });

    test("reports the local cloud as reachable (its docker daemon answers)", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        const probe = (await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${created.uid}:test`).set(owner).expect(HttpStatus.OK)).body;
        expect(probe.ok).toBe(true);
    });

    test("rejects an unknown custom method on a cloud account with NOT_FOUND", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${created.uid}:frobnicate`).set(owner).expect(HttpStatus.NOT_FOUND);
    });

    test("does not probe a cloud account of another project (NOT_FOUND)", async () => {
        const first = await seedProject();
        const second = await seedProject();
        const created = (await connect(first.uid, first.owner, "local").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${second.uid}/cloudAccounts/${created.uid}:test`)
            .set(second.owner).expect(HttpStatus.NOT_FOUND);
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
