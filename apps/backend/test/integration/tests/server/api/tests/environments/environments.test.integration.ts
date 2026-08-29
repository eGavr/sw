import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

const validEnvironmentBody = {
    platform: { name: "linux", version: "latest" },
    applications: [{ name: "chrome", version: "126" }],
};

describe("/projects/:project/environments", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    // The owner of a fresh project holds every environment permission (grant-all on creation).
    const createProject = async (): Promise<{ owner: { authorization: string }, projectId: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(owner)
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        // Connect the local cloud so create-environment resolves a cloud for linux/container.
        await request(app.getHttpServer())
            .post(`/projects/${body.uid}/cloudAccounts`)
            .set(owner)
            .send({ type: "local" })
            .expect(HttpStatus.CREATED);

        return { owner, projectId: body.uid };
    };

    const createEnvironment = (projectId: string, owner: { authorization: string }): request.Test =>
        request(app.getHttpServer()).post(`/projects/${projectId}/environments`).set(owner).send(validEnvironmentBody);

    describe("POST (create)", () => {
        test("lets the owner create an environment as an AIP resource", async () => {
            const { owner, projectId } = await createProject();

            const { body } = await createEnvironment(projectId, owner).expect(HttpStatus.CREATED);

            expect(body).toEqual({
                name: `projects/${projectId}/environments/${body.uid}`,
                uid: expect.any(String),
                state: "ENQUEUED",
                platform: { name: "linux", version: "latest", deviceModel: "desktop" },
                execution: "container",
                applications: [{ name: "chrome", version: "126" }],
                busy: false,
                createTime: expect.any(String),
            });
        });

        // No catalogue entry provisions the emulator substrate yet (the android emulator adapter is not
        // live-verified), so an explicit emulator request has no cloud to land on.
        test("rejects an execution substrate no connected cloud provides", async () => {
            const { owner, projectId } = await createProject();

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/cloudAccounts`).set(owner).send({ type: "yandex-cloud" })
                .expect(HttpStatus.CREATED);

            return request(app.getHttpServer())
                .post(`/projects/${projectId}/environments`)
                .set(owner)
                .send({
                    platform: { name: "android", version: "13" },
                    applications: [{ name: "settings", version: "13" }],
                    execution: "emulator",
                })
                .expect(HttpStatus.CONFLICT);
        });

        test("responds INVALID_ARGUMENT for an unknown execution substrate", async () => {
            const { owner, projectId } = await createProject();

            return request(app.getHttpServer())
                .post(`/projects/${projectId}/environments`)
                .set(owner)
                .send({ ...validEnvironmentBody, execution: "bare-metal" })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds UNAUTHENTICATED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .post(`/projects/${uuidv4()}/environments`)
                .send(validEnvironmentBody)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds PERMISSION_DENIED for a non-owner", async () => {
            const { projectId } = await createProject();
            const stranger = Authorization.forUser(UserFactory.createId());

            return createEnvironment(projectId, stranger)
                .expect(HttpStatus.FORBIDDEN)
                .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));
        });

        test("lets a caller create an environment through a group role", async () => {
            const ownerId = UserFactory.createId();
            const owner = Authorization.forUser(ownerId);
            const { body: project } = await request(app.getHttpServer())
                .post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .post(`/projects/${project.uid}/cloudAccounts`).set(owner).send({ type: "local" })
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .post(`/projects/${project.uid}:setIamPolicy`)
                .set(owner)
                .send({
                    policy: {
                        bindings: [
                            { role: "roles/admin", members: [`user:${ownerId}`] },
                            { role: "roles/developer", members: ["group:eng"] },
                        ], 
                    }, 
                })
                .expect(HttpStatus.OK);

            // A caller the IdP puts in group eng — not bound directly — may create an environment.
            return createEnvironment(project.uid, Authorization.forUser(UserFactory.createId(), ["eng"]))
                .expect(HttpStatus.CREATED);
        });

        test("responds INVALID_ARGUMENT for an invalid body", async () => {
            const { owner, projectId } = await createProject();

            return request(app.getHttpServer())
                .post(`/projects/${projectId}/environments`)
                .set(owner)
                .send({})
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("responds NOT_FOUND for a non-existent project", () => {
            return request(app.getHttpServer())
                .post(`/projects/${uuidv4()}/environments`)
                .set(Authorization.forUser(UserFactory.createId()))
                .send(validEnvironmentBody)
                .expect(HttpStatus.NOT_FOUND);
        });

        test("responds INVALID_ARGUMENT for a non-concrete application version", async () => {
            const { owner, projectId } = await createProject();

            return request(app.getHttpServer())
                .post(`/projects/${projectId}/environments`)
                .set(owner)
                .send({ ...validEnvironmentBody, applications: [{ name: "chrome", version: "latest" }] })
                .expect(HttpStatus.BAD_REQUEST);
        });
    });

    describe("occupancy (busy + heartbeat freshness)", () => {
        // Occupancy is orthogonal to lifecycle: a session never changes `state`, only the agent's
        // heartbeat flips `busy`. The heartbeat itself arrives on the internal server, so the agent's
        // report is seeded through the repository here and asserted through the public read.
        test("exposes busy and the heartbeat time reported by the agent", async () => {
            const { owner, projectId } = await createProject();
            const { body: created } = await createEnvironment(projectId, owner).expect(HttpStatus.CREATED);

            const environmentRepository = app.app.get(EnvironmentRepository);
            const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

            if (!claimed) {
                throw new Error("expected an enqueued environment to claim");
            }

            claimed.markDispatched();
            claimed.register(new EnvironmentEndpoint("http://127.0.0.1:45454"), new Date());
            claimed.heartbeat(true, new Date());
            await environmentRepository.save(claimed);

            const { body } = await request(app.getHttpServer())
                .get(`/projects/${projectId}/environments/${created.uid}`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(body.state).toBe("ACTIVE");
            expect(body.busy).toBe(true);
            expect(body.lastHeartbeatTime).toEqual(expect.any(String));

            const freed = await environmentRepository.get(EnvironmentId.fromString(created.uid));
            freed.heartbeat(false, new Date());
            await environmentRepository.save(freed);

            const { body: after } = await request(app.getHttpServer())
                .get(`/projects/${projectId}/environments/${created.uid}`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(after.busy).toBe(false);
        });
    });

    describe("lifecycle (create -> get -> list -> delete)", () => {
        test("creates enqueued, reads, lists and deletes an environment (state-based)", async () => {
            const { owner, projectId } = await createProject();

            const { body: environment } = await createEnvironment(projectId, owner).expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .get(`/projects/${projectId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK)
                .expect((response) => {
                    expect(response.body.uid).toBe(environment.uid);
                    expect(response.body.state).toBe("ENQUEUED");
                });

            const list = await request(app.getHttpServer())
                .get(`/projects/${projectId}/environments`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(list.body.environments).toHaveLength(1);
            expect(list.body.environments[0].uid).toBe(environment.uid);

            const deleted = await request(app.getHttpServer())
                .delete(`/projects/${projectId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK);

            // AIP-135 soft delete returns the resource with its lifecycle state, not an empty body. This
            // environment never heartbeated, so it reads as DELETED immediately (nothing to deprovision).
            expect(deleted.body.uid).toBe(environment.uid);
            expect(deleted.body.state).toBe("DELETED");

            // Idempotent while the row survives (GC removes it later): a repeated delete returns it again.
            await request(app.getHttpServer())
                .delete(`/projects/${projectId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK)
                .expect((response) => expect(response.body.state).toBe("DELETED"));

            // GET keeps deriving DELETED until GC removes the row.
            await request(app.getHttpServer())
                .get(`/projects/${projectId}/environments/${environment.uid}`)
                .set(owner)
                .expect(HttpStatus.OK)
                .expect((response) => expect(response.body.state).toBe("DELETED"));
        });
    });

    describe("provider resolution by (platform, execution)", () => {
        const androidEnvironment = {
            platform: { name: "android", version: "13" },
            applications: [{ name: "settings", version: "13" }],
        };

        const createProjectWithClouds = async (
            cloudTypes: Array<string>,
        ): Promise<{ owner: { authorization: string }, projectId: string }> => {
            const owner = Authorization.forUser(UserFactory.createId());
            const { body } = await request(app.getHttpServer())
                .post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

            for (const type of cloudTypes) {
                await request(app.getHttpServer())
                    .post(`/projects/${body.uid}/cloudAccounts`).set(owner).send({ type }).expect(HttpStatus.CREATED);
            }

            return { owner, projectId: body.uid };
        };

        const createEnvironmentBody = (projectId: string, owner: { authorization: string }, body: object): request.Test =>
            request(app.getHttpServer()).post(`/projects/${projectId}/environments`).set(owner).send(body);

        // local (linux/container) and yandex-cloud (android/*) do not overlap, so both can be connected.
        test("routes each environment to the cloud serving its substrate", async () => {
            const { owner, projectId } = await createProjectWithClouds(["local", "yandex-cloud"]);

            await createEnvironmentBody(projectId, owner, validEnvironmentBody).expect(HttpStatus.CREATED);
            await createEnvironmentBody(projectId, owner, androidEnvironment).expect(HttpStatus.CREATED);
        });

        test("rejects an environment no active cloud serves (platform/execution mismatch)", async () => {
            const { owner, projectId } = await createProjectWithClouds(["yandex-cloud"]);

            await createEnvironmentBody(projectId, owner, androidEnvironment).expect(HttpStatus.CREATED);
            await createEnvironmentBody(projectId, owner, validEnvironmentBody).expect(HttpStatus.CONFLICT);
        });
    });

    // get/delete look the environment up before touching the project, so id/existence errors precede authz.
    describe("GET /:environment (errors)", () => {
        test("responds UNAUTHENTICATED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .get(`/projects/${uuidv4()}/environments/${uuidv4()}`)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds UNAUTHENTICATED for an invalid token", () => {
            return request(app.getHttpServer())
                .get(`/projects/${uuidv4()}/environments/${uuidv4()}`)
                .set(Authorization.invalidToken)
                .expect(HttpStatus.UNAUTHORIZED);
        });

        // A non-uuid token is a valid human-id handle, so an unknown one is NOT_FOUND (not malformed).
        test("responds NOT_FOUND for an unknown environment handle in an existing project", async () => {
            const { owner, projectId } = await createProject();

            return request(app.getHttpServer())
                .get(`/projects/${projectId}/environments/no-such-environment`)
                .set(owner)
                .expect(HttpStatus.NOT_FOUND);
        });

        test("responds NOT_FOUND for a non-existent environment", () => {
            return request(app.getHttpServer())
                .get(`/projects/${uuidv4()}/environments/${uuidv4()}`)
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
