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
const environmentBody = {
    platform: { name: "linux", version: "latest" },
    applications: [{ name: "chrome", version: "126" }],
};

// UserFactory ids are `user-<hex>`: lowercase, letter-led — a valid, unique human resource id.
const humanId = (): string => UserFactory.createId();

describe("human-readable environment ids", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const connectCloud = (projectId: string, owner: AuthHeader): request.Test =>
        request(app.getHttpServer()).post(`/projects/${projectId}/cloudAccounts`).set(owner).send({ type: "noop" });

    const createProject = async (): Promise<{ owner: AuthHeader, projectId: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const { body } = await request(app.getHttpServer())
            .post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

        await connectCloud(body.uid, owner).expect(HttpStatus.CREATED);

        return { owner, projectId: body.uid };
    };

    const createEnvironment = (projectId: string, owner: AuthHeader, overrides: object = {}): request.Test =>
        request(app.getHttpServer())
            .post(`/projects/${projectId}/environments`).set(owner).send({ ...environmentBody, ...overrides });

    test("addresses an environment by the client-chosen id, keeping the uid separate", async () => {
        const { owner, projectId } = await createProject();
        const environmentId = humanId();

        const { body } = await createEnvironment(projectId, owner, { environmentId }).expect(HttpStatus.CREATED);

        expect(body.name).toBe(`projects/${projectId}/environments/${environmentId}`);
        expect(body.uid).toMatch(uuidPattern);
        expect(environmentId).not.toBe(body.uid);

        await request(app.getHttpServer())
            .get(`/projects/${projectId}/environments/${environmentId}`).set(owner).expect(HttpStatus.OK);
        await request(app.getHttpServer())
            .get(`/projects/${projectId}/environments/${body.uid}`).set(owner).expect(HttpStatus.OK);
    });

    test("falls back to the uid in the name when no id is given", async () => {
        const { owner, projectId } = await createProject();

        const { body } = await createEnvironment(projectId, owner).expect(HttpStatus.CREATED);

        expect(body.name).toBe(`projects/${projectId}/environments/${body.uid}`);
    });

    test("rejects a duplicate id within the same project", async () => {
        const { owner, projectId } = await createProject();
        const environmentId = humanId();
        await createEnvironment(projectId, owner, { environmentId }).expect(HttpStatus.CREATED);

        await createEnvironment(projectId, owner, { environmentId }).expect(HttpStatus.CONFLICT);
    });

    test("allows the same id in a different project (per-project uniqueness)", async () => {
        const environmentId = humanId();
        const first = await createProject();
        const second = await createProject();

        await createEnvironment(first.projectId, first.owner, { environmentId }).expect(HttpStatus.CREATED);
        await createEnvironment(second.projectId, second.owner, { environmentId }).expect(HttpStatus.CREATED);
    });

    test("rejects an invalid id format", async () => {
        const { owner, projectId } = await createProject();

        return createEnvironment(projectId, owner, { environmentId: "Bad_Id" }).expect(HttpStatus.BAD_REQUEST);
    });

    test("rejects a uuid-shaped id", async () => {
        const { owner, projectId } = await createProject();

        return createEnvironment(projectId, owner, { environmentId: uuidv4() }).expect(HttpStatus.BAD_REQUEST);
    });

    test("addresses an environment under the project's human id too", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const projectId = humanId();
        await request(app.getHttpServer())
            .post("/projects").set(owner).send(CreateProjectBody.create({ projectId })).expect(HttpStatus.CREATED);
        await connectCloud(projectId, owner).expect(HttpStatus.CREATED);

        const environmentId = humanId();
        const { body } = await createEnvironment(projectId, owner, { environmentId }).expect(HttpStatus.CREATED);

        expect(body.name).toBe(`projects/${projectId}/environments/${environmentId}`);
    });
});
