import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { SecretStore } from "../../../../../../../src/application/interfaces/gateways/secret-store";
import {
    CloudAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/cloud-account-data-source";
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
        expect(created).toMatchObject({ uid: expect.any(String), type: "yandex-cloud" });
        expect(created.provides).toEqual([{ platform: "android", execution: "container" }]);

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

    test("allows clouds with disjoint substrates but rejects an overlapping one (CONFLICT)", async () => {
        const { owner, uid } = await seedProject();

        // yandex-cloud (android/*) and local (linux/container) do not overlap.
        await connect(uid, owner, "yandex-cloud").expect(HttpStatus.CREATED);
        await connect(uid, owner, "local").expect(HttpStatus.CREATED);

        // A second local provides the same linux/container -> overlaps the first -> rejected.
        return connect(uid, owner, "local").expect(HttpStatus.CONFLICT);
    });

    test("stores the connect credential in the secret store, persisting only a reference, never the secret", async () => {
        const { owner, uid } = await seedProject();
        const material = "yc-service-account-key-json-blob";

        const created = (await request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner)
            .send({ type: "local", credential: material }).expect(HttpStatus.CREATED)).body;

        // The secret is never on the wire — not on create, get, or list.
        expect(created).not.toHaveProperty("credential");
        expect(created).not.toHaveProperty("credentialRef");
        const fetched = (await request(app.getHttpServer())
            .get(`/projects/${uid}/cloudAccounts/${created.uid}`).set(owner).expect(HttpStatus.OK)).body;
        expect(fetched).not.toHaveProperty("credential");
        expect(fetched).not.toHaveProperty("credentialRef");

        // What is persisted is a reference, not the secret; the reference resolves back to the material.
        const stored = await app.app.get(CloudAccountDataSource).findOne(created.uid);
        expect(stored?.credentialRef).toEqual(expect.any(String));
        expect(stored?.credentialRef).not.toEqual(material);
        expect(await app.app.get(SecretStore).resolve(stored!.credentialRef!)).toEqual(material);
    });

    test("connects a credential-free cloud without a reference", async () => {
        const { owner, uid } = await seedProject();
        const created = (await connect(uid, owner, "local").expect(HttpStatus.CREATED)).body;

        const stored = await app.app.get(CloudAccountDataSource).findOne(created.uid);
        expect(stored?.credentialRef).toBeNull();
    });

    test("rejects an empty credential with INVALID_ARGUMENT", async () => {
        const { owner, uid } = await seedProject();

        return request(app.getHttpServer())
            .post(`/projects/${uid}/cloudAccounts`).set(owner)
            .send({ type: "local", credential: "" }).expect(HttpStatus.BAD_REQUEST);
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
