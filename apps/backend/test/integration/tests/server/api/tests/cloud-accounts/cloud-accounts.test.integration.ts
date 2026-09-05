import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

// Stub YC resource ids in the catalogue's required format (20 lowercase base32 characters).
const stubFolderId = "b1gstubstubstubstub0";
const stubClusterId = "cat0stubstubstubstub";

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

    // Connect needs nothing but the type: what the user names (folder, cluster) belongs to the bindings.
    const connect = (uid: string, auth: AuthHeader, type: string): request.Test =>
        request(app.getHttpServer()).post(`/projects/${uid}/cloudAccounts`).set(auth).send({ type });

    test("connects a cloud EMPTY — platforms are bound explicitly, no implicit defaults", async () => {
        const { owner, uid } = await seedProject();

        const created = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        expect(created).toMatchObject({ uid: expect.any(String), type: "yandex-cloud" });
        expect(created.computeBindings).toEqual([]);

        const bound = (await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${created.uid}/computeBindings`).set(owner)
            .send({ platform: "android", execution: "container", kind: "vm", config: { folderId: stubFolderId } })
            .expect(HttpStatus.CREATED)).body;
        expect(bound).toMatchObject({
            platform: "android", execution: "container", kind: "vm", config: { folderId: stubFolderId },
        });

        const list = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts`).set(owner).expect(HttpStatus.OK)).body;
        expect(list.cloudAccounts.map((account: { type: string }) => account.type)).toContain("yandex-cloud");
    });

    test("refuses account-level config at connect — what the user names belongs to a binding", async () => {
        const { owner, uid } = await seedProject();

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner)
            .send({ type: "yandex-cloud", config: { folderId: stubFolderId } })
            .expect(HttpStatus.BAD_REQUEST);
    });

    test("binds linux to the user's kubernetes cluster, re-points it, and unbinds", async () => {
        const { owner, uid } = await seedProject();
        const account = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        const bindings = `/projects/${uid}/cloudAccounts/${account.uid}/computeBindings`;

        // The kubernetes kind demands the cluster; without it the binding is refused.
        await request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "kubernetes" })
            .expect(HttpStatus.BAD_REQUEST);

        const bound = (await request(app.getHttpServer()).post(bindings).set(owner)
            .send({
                platform: "ubuntu", execution: "container", kind: "kubernetes", config: { clusterId: stubClusterId },
            })
            .expect(HttpStatus.CREATED)).body;
        expect(bound).toMatchObject({ kind: "kubernetes", config: { clusterId: stubClusterId } });

        // A second binding for the same substrate is ambiguous.
        await request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "vm", config: { folderId: stubFolderId } })
            .expect(HttpStatus.CONFLICT);

        // Re-pointing at another kind replaces the kind's config — and demands the new kind's keys.
        await request(app.getHttpServer()).patch(`${bindings}/${bound.uid}`).set(owner)
            .send({ kind: "vm" }).expect(HttpStatus.BAD_REQUEST);
        const rebound = (await request(app.getHttpServer()).patch(`${bindings}/${bound.uid}`).set(owner)
            .send({ kind: "vm", config: { folderId: stubFolderId } }).expect(HttpStatus.OK)).body;
        expect(rebound).toMatchObject({ kind: "vm", config: { folderId: stubFolderId } });

        await request(app.getHttpServer()).delete(`${bindings}/${bound.uid}`).set(owner)
            .expect(HttpStatus.NO_CONTENT);
        const listed = (await request(app.getHttpServer()).get(bindings).set(owner).expect(HttpStatus.OK)).body;
        expect(listed.computeBindings).toEqual([]);
    });

    test("rejects a kind the catalogue does not offer for the substrate", async () => {
        const { owner, uid } = await seedProject();
        const account = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account.uid}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "teleportation" })
            .expect(HttpStatus.BAD_REQUEST);
    });

    // Presence and format are refused at create; whether the folder exists and is granted is the probe's
    // answer, never a create-blocker (the user may run the grants later).
    test("rejects a vm binding without its folder, or with one that is not a YC id", async () => {
        const { owner, uid } = await seedProject();
        const account = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;
        const bindings = `/projects/${uid}/cloudAccounts/${account.uid}/computeBindings`;

        await request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "android", execution: "container", kind: "vm" })
            .expect(HttpStatus.BAD_REQUEST);

        return request(app.getHttpServer()).post(bindings).set(owner)
            .send({ platform: "android", execution: "container", kind: "vm", config: { folderId: "my folder!" } })
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
            .post(`/projects/${uid}/cloudAccounts/${created.uid}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "docker" })
            .expect(HttpStatus.CREATED);

        await request(app.getHttpServer())
            .post(`/projects/${uid}/environments`)
            .set(owner)
            .send({
                platform: { name: "ubuntu", version: "24.04" },
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

        const local = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;
        await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${local.uid}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "docker" })
            .expect(HttpStatus.CREATED);

        // yandex-cloud connects fine, but binding ITS linux would make routing ambiguous.
        const yandex = (await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${yandex.uid}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "vm", config: { folderId: stubFolderId } })
            .expect(HttpStatus.CONFLICT);
    });

    test("rejects an unknown cloud type with INVALID_ARGUMENT", async () => {
        const { owner, uid } = await seedProject();

        return connect(uid, owner, "wandering-cloud").expect(HttpStatus.BAD_REQUEST);
    });

    const bindLocalDocker = async (uid: string, owner: AuthHeader): Promise<{ account: string, binding: string }> => {
        const account = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;
        const binding = (await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account.uid}/computeBindings`).set(owner)
            .send({ platform: "ubuntu", execution: "container", kind: "docker" })
            .expect(HttpStatus.CREATED)).body;

        return { account: account.uid, binding: binding.uid };
    };

    test("reports the local binding as reachable (its docker daemon answers)", async () => {
        const { owner, uid } = await seedProject();
        const { account, binding } = await bindLocalDocker(uid, owner);

        const probe = (await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account}/computeBindings/${binding}:test`)
            .set(owner).expect(HttpStatus.OK)).body;
        expect(probe.ok).toBe(true);
    });

    test("rejects an unknown custom method on a compute binding with NOT_FOUND", async () => {
        const { owner, uid } = await seedProject();
        const { account, binding } = await bindLocalDocker(uid, owner);

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${account}/computeBindings/${binding}:frobnicate`)
            .set(owner).expect(HttpStatus.NOT_FOUND);
    });

    // The probe moved onto the binding: access is a property of what the binding names, so the account
    // resource has no :test any more.
    test("no longer exposes an account-level :test", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts/${created.uid}:test`).set(owner).expect(HttpStatus.NOT_FOUND);
    });

    test("does not probe a binding of another project (NOT_FOUND)", async () => {
        const first = await seedProject();
        const second = await seedProject();
        const { account, binding } = await bindLocalDocker(first.uid, first.owner);

        return request(app.getHttpServer())
            .post(`/projects/${second.uid}/cloudAccounts/${account}/computeBindings/${binding}:test`)
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
