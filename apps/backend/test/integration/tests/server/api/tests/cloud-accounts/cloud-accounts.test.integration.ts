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

    test("connects a cloud, auto-binding the substrates that have nothing to ask", async () => {
        const { owner, uid } = await seedProject();

        const created = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        expect(created).toMatchObject({ uid: expect.any(String), type: "yandex-cloud" });
        // android has one configless kind -> bound automatically; linux offers a choice -> left unbound.
        expect(created.computeBindings).toEqual([
            {
                name: expect.any(String), uid: expect.any(String),
                platform: "android", execution: "container", kind: "vm", config: {}, 
            },
        ]);

        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.cloudAccounts.map((account: { type: string }) => account.type)).toContain("yandex-cloud");
    });

    test("binds linux to the user's kubernetes cluster, re-points it, and unbinds", async () => {
        const { owner, uid } = await seedProject();
        const account = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        const bindings = `/projects/${uid}/cloudAccounts/${account.uid}/computeBindings`;

        // The kubernetes kind demands the cluster; without it the binding is refused.
        await request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "linux", execution: "container", kind: "kubernetes" })
            .expect(HttpStatus.BAD_REQUEST);

        const bound = (await request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "linux", execution: "container", kind: "kubernetes", config: { clusterId: "cat9" } })
            .expect(HttpStatus.CREATED)).body;
        expect(bound).toMatchObject({ kind: "kubernetes", config: { clusterId: "cat9" } });

        // A second binding for the same substrate is ambiguous.
        await request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "linux", execution: "container", kind: "vm" })
            .expect(HttpStatus.CONFLICT);

        // Re-pointing at another kind replaces the kind's config; new environments follow it.
        const rebound = (await request(app.getHttpServer()).patch(`${bindings}/${bound.uid}`).set(owner)
            .send({ kind: "vm" }).expect(HttpStatus.OK)).body;
        expect(rebound).toMatchObject({ kind: "vm", config: {} });

        await request(app.getHttpServer()).delete(`${bindings}/${bound.uid}`).set(owner)
            .expect(HttpStatus.NO_CONTENT);
        const listed = (await request(app.getHttpServer()).get(bindings).set(owner).expect(HttpStatus.OK)).body;
        expect(listed.computeBindings.map((binding: { platform: string }) => binding.platform))
            .toEqual(["android"]);
    });

    test("rejects a kind the catalogue does not offer for the substrate", async () => {
        const { owner, uid } = await seedProject();
        const account = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account.uid}/computeBindings`).set(owner)
            .send({ platform: "linux", execution: "container", kind: "teleportation" })
            .expect(HttpStatus.BAD_REQUEST);
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

    test("keeps a substrate bound once across the project", async () => {
        const { owner, uid } = await seedProject();

        // local auto-binds linux/container to docker.
        const local = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;
        expect(local.computeBindings).toEqual([
            expect.objectContaining({ platform: "linux", execution: "container", kind: "docker" }),
        ]);

        // yandex-cloud still connects (android auto-binds), but binding ITS linux would be ambiguous.
        const yandex = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${yandex.uid}/computeBindings`).set(owner)
            .send({ platform: "linux", execution: "container", kind: "vm" })
            .expect(HttpStatus.CONFLICT);
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
