import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// UserFactory ids are `user-<hex>`: lowercase, letter-led — a valid, unique human resource id.
const humanId = (): string => UserFactory.createId();

describe("human-readable project ids", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const create = (owner: AuthHeader, overrides: object = {}): request.Test =>
        request(app.getHttpServer()).post("/projects").set(owner).send(CreateProjectBody.create(overrides));

    const owner = (): AuthHeader => Authorization.forUser(UserFactory.createId());

    test("addresses a project by the client-chosen id, keeping the uid separate", async () => {
        const auth = owner();
        const projectId = humanId();

        const { body } = await create(auth, { projectId }).expect(HttpStatus.CREATED);

        expect(body.name).toBe(`projects/${projectId}`);
        expect(body.uid).toMatch(uuidPattern);
        expect(projectId).not.toBe(body.uid);

        await request(app.getHttpServer()).get(`/projects/${projectId}`).set(auth).expect(HttpStatus.OK);
        await request(app.getHttpServer()).get(`/projects/${body.uid}`).set(auth).expect(HttpStatus.OK);
    });

    test("falls back to the uid in the name when no id is given", async () => {
        const { body } = await create(owner()).expect(HttpStatus.CREATED);

        expect(body.name).toBe(`projects/${body.uid}`);
    });

    test("rejects a duplicate id", async () => {
        const projectId = humanId();
        await create(owner(), { projectId }).expect(HttpStatus.CREATED);

        await create(owner(), { projectId }).expect(HttpStatus.CONFLICT);
    });

    test("rejects an invalid id format", async () => {
        await create(owner(), { projectId: "Bad_Id" }).expect(HttpStatus.BAD_REQUEST);
    });

    test("rejects a uuid-shaped id", async () => {
        await create(owner(), { projectId: uuidv4() }).expect(HttpStatus.BAD_REQUEST);
    });

    test("resolves a nested resource by the project's human id", async () => {
        const auth = owner();
        const projectId = humanId();
        await create(auth, { projectId }).expect(HttpStatus.CREATED);

        await request(app.getHttpServer())
            .get(`/projects/${projectId}/providerAccounts`).set(auth).expect(HttpStatus.OK);
    });
});
