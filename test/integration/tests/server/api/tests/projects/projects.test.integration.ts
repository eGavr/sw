import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { UserPermissionList } from "../../../../../../../src/domain/entities/user/user-permission-list";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

describe("/projects", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const createProject = async (
        owner: AuthHeader = Authorization.forUser(UserFactory.createId()),
    ): Promise<{ owner: AuthHeader, uid: string }> => {
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(owner)
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        return { owner, uid: body.uid };
    };

    describe("POST /projects", () => {
        test("responds UNAUTHENTICATED for an unauthenticated request", () => {
            return request(app.getHttpServer())
                .post("/projects")
                .send(CreateProjectBody.create())
                .expect(HttpStatus.UNAUTHORIZED)
                .expect((response) => expect(response.body.error.status).toBe("UNAUTHENTICATED"));
        });

        test("responds UNAUTHENTICATED for an invalid token", () => {
            return request(app.getHttpServer())
                .post("/projects")
                .set(Authorization.invalidToken)
                .send(CreateProjectBody.create())
                .expect(HttpStatus.UNAUTHORIZED);
        });

        test("responds INVALID_ARGUMENT when displayName has the wrong type", () => {
            return request(app.getHttpServer())
                .post("/projects")
                .set(Authorization.forUser(UserFactory.createId()))
                .send(CreateProjectBody.create({ displayName: 12345 }))
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
        });

        test("responds INVALID_ARGUMENT when displayName violates the domain rule", () => {
            return request(app.getHttpServer())
                .post("/projects")
                .set(Authorization.forUser(UserFactory.createId()))
                .send(CreateProjectBody.create({ displayName: "not a valid name!" }))
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.message).toMatch(/project name/));
        });

        test("is self-service: any authenticated user creates an project and gets an AIP resource", async () => {
            const compute = [{ provider: "noop", platform: "linux", execution: "container" }];
            const { body } = await request(app.getHttpServer())
                .post("/projects")
                .set(Authorization.forUser(UserFactory.createId()))
                .send({ displayName: "team-a", compute })
                .expect(HttpStatus.CREATED);

            expect(body).toEqual({
                name: `projects/${body.uid}`,
                uid: expect.any(String),
                displayName: "team-a",
                createTime: expect.any(String),
                updateTime: expect.any(String),
            });
        });

        test("supports creating multiple projects for one user", async () => {
            const owner = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer()).post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);
        });

        test("responds INVALID_ARGUMENT for a compute provider with no registered adapter", async () => {
            const compute = [{ provider: "there-is-no-such-provider", platform: "linux", execution: "container" }];

            return request(app.getHttpServer())
                .post("/projects")
                .set(Authorization.forUser(UserFactory.createId()))
                .send({ displayName: "team-a", compute })
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
        });
    });

    describe("GET /projects", () => {
        test("lists only the caller's own projects", async () => {
            const alice = Authorization.forUser(UserFactory.createId());
            const bob = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer()).post("/projects").set(alice).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/projects").set(alice).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/projects").set(bob).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

            const { body } = await request(app.getHttpServer()).get("/projects").set(alice).expect(HttpStatus.OK);

            expect(body.projects).toHaveLength(2);
        });

        test("paginates with pageSize and an opaque nextPageToken", async () => {
            const alice = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer()).post("/projects").set(alice).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);
            await request(app.getHttpServer()).post("/projects").set(alice).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

            const first = await request(app.getHttpServer()).get("/projects?pageSize=1").set(alice).expect(HttpStatus.OK);

            expect(first.body.projects).toHaveLength(1);
            expect(first.body.nextPageToken).toEqual(expect.any(String));

            const second = await request(app.getHttpServer())
                .get(`/projects?pageSize=1&pageToken=${first.body.nextPageToken}`)
                .set(alice)
                .expect(HttpStatus.OK);

            expect(second.body.projects).toHaveLength(1);
            expect(second.body.projects[0].uid).not.toBe(first.body.projects[0].uid);
            // End of the collection — AIP-158 signals it by an absent next_page_token.
            expect(second.body.nextPageToken).toBeUndefined();
        });
    });

    describe("GET /projects/:project", () => {
        test("lets the owner read the project", async () => {
            const { owner, uid } = await createProject();

            const { body } = await request(app.getHttpServer()).get(`/projects/${uid}`).set(owner).expect(HttpStatus.OK);

            expect(body.uid).toBe(uid);
            expect(body.name).toBe(`projects/${uid}`);
        });

        test("responds PERMISSION_DENIED for a non-owner", async () => {
            const { uid } = await createProject();
            const stranger = Authorization.forUser(UserFactory.createId());

            return request(app.getHttpServer())
                .get(`/projects/${uid}`)
                .set(stranger)
                .expect(HttpStatus.FORBIDDEN)
                .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));
        });

        test("responds NOT_FOUND for a non-existent project", () => {
            return request(app.getHttpServer())
                .get(`/projects/${uuidv4()}`)
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.NOT_FOUND);
        });

        test("responds INVALID_ARGUMENT for a malformed project id", () => {
            return request(app.getHttpServer())
                .get("/projects/not-a-uuid")
                .set(Authorization.forUser(UserFactory.createId()))
                .expect(HttpStatus.BAD_REQUEST);
        });
    });

    describe("POST /projects/:project:testIamPermissions", () => {
        test("returns the held subset of the requested permissions for the owner", async () => {
            const { owner, uid } = await createProject();

            const { body } = await request(app.getHttpServer())
                .post(`/projects/${uid}:testIamPermissions`)
                .set(owner)
                .send({ permissions: ["sw.environments.create", "sw.projects.get"] })
                .expect(HttpStatus.OK);

            expect(body).toEqual({ permissions: ["sw.environments.create", "sw.projects.get"] });
        });

        test("grants the owner every permission after project creation", async () => {
            const { owner, uid } = await createProject();
            const permissions = UserPermissionList.getAll().toArray().map((permission) => permission.name);

            const { body } = await request(app.getHttpServer())
                .post(`/projects/${uid}:testIamPermissions`)
                .set(owner)
                .send({ permissions })
                .expect(HttpStatus.OK);

            expect(body.permissions.sort()).toEqual([...permissions].sort());
        });

        test("returns an empty set for a user who holds none", async () => {
            const { uid } = await createProject();
            const stranger = Authorization.forUser(UserFactory.createId());

            return request(app.getHttpServer())
                .post(`/projects/${uid}:testIamPermissions`)
                .set(stranger)
                .send({ permissions: ["sw.environments.create", "sw.projects.get"] })
                .expect(HttpStatus.OK, { permissions: [] });
        });

        test("responds INVALID_ARGUMENT for an unknown permission", async () => {
            const { owner, uid } = await createProject();

            return request(app.getHttpServer())
                .post(`/projects/${uid}:testIamPermissions`)
                .set(owner)
                .send({ permissions: ["sw.environments.teleport"] })
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
        });

        test("responds NOT_FOUND for an unknown custom verb", async () => {
            const { owner, uid } = await createProject();

            return request(app.getHttpServer())
                .post(`/projects/${uid}:doSomethingElse`)
                .set(owner)
                .send({ permissions: ["sw.projects.get"] })
                .expect(HttpStatus.NOT_FOUND);
        });
    });

    const createProjectFor = async (externalId: string): Promise<string> => {
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(Authorization.forUser(externalId))
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        return body.uid;
    };

    describe("POST /projects/:project:getIamPolicy", () => {
        test("returns the policy with the owner bound to roles/admin", async () => {
            const ownerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);

            const { body } = await request(app.getHttpServer())
                .post(`/projects/${uid}:getIamPolicy`)
                .set(Authorization.forUser(ownerId))
                .send({})
                .expect(HttpStatus.OK);

            expect(body).toEqual({
                version: 1,
                etag: expect.any(String),
                bindings: [{ role: "roles/admin", members: [`user:${ownerId}`] }],
            });
        });

        test("responds PERMISSION_DENIED for a non-owner", async () => {
            const uid = await createProjectFor(UserFactory.createId());

            return request(app.getHttpServer())
                .post(`/projects/${uid}:getIamPolicy`)
                .set(Authorization.forUser(UserFactory.createId()))
                .send({})
                .expect(HttpStatus.FORBIDDEN);
        });
    });

    describe("POST /projects/:project:setIamPolicy", () => {
        const testPermissions = (uid: string, auth: AuthHeader, permissions: Array<string>): request.Test =>
            request(app.getHttpServer()).post(`/projects/${uid}:testIamPermissions`).set(auth).send({ permissions });

        test("lets the owner grant another user a role that then takes effect", async () => {
            const ownerId = UserFactory.createId();
            const developerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);
            const developer = Authorization.forUser(developerId);

            await testPermissions(uid, developer, ["sw.environments.create"]).expect(HttpStatus.OK, { permissions: [] });

            const { body } = await request(app.getHttpServer())
                .post(`/projects/${uid}:setIamPolicy`)
                .set(Authorization.forUser(ownerId))
                .send({
                    policy: {
                        bindings: [
                            { role: "roles/admin", members: [`user:${ownerId}`] },
                            { role: "roles/developer", members: [`user:${developerId}`] },
                        ], 
                    }, 
                })
                .expect(HttpStatus.OK);

            expect(body.bindings).toEqual(expect.arrayContaining([
                { role: "roles/developer", members: [`user:${developerId}`] },
            ]));

            await testPermissions(uid, developer, ["sw.environments.create"])
                .expect(HttpStatus.OK, { permissions: ["sw.environments.create"] });
        });

        test("responds PERMISSION_DENIED for a member without setIamPolicy", async () => {
            const ownerId = UserFactory.createId();
            const developerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);

            await request(app.getHttpServer())
                .post(`/projects/${uid}:setIamPolicy`)
                .set(Authorization.forUser(ownerId))
                .send({
                    policy: {
                        bindings: [
                            { role: "roles/admin", members: [`user:${ownerId}`] },
                            { role: "roles/developer", members: [`user:${developerId}`] },
                        ], 
                    }, 
                })
                .expect(HttpStatus.OK);

            return request(app.getHttpServer())
                .post(`/projects/${uid}:setIamPolicy`)
                .set(Authorization.forUser(developerId))
                .send({ policy: { bindings: [{ role: "roles/admin", members: [`user:${developerId}`] }] } })
                .expect(HttpStatus.FORBIDDEN);
        });

        test("responds INVALID_ARGUMENT for an unknown role", async () => {
            const ownerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);

            return request(app.getHttpServer())
                .post(`/projects/${uid}:setIamPolicy`)
                .set(Authorization.forUser(ownerId))
                .send({ policy: { bindings: [{ role: "roles/wizard", members: [`user:${ownerId}`] }] } })
                .expect(HttpStatus.BAD_REQUEST)
                .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
        });

        const getPolicy = (uid: string, auth: AuthHeader): request.Test =>
            request(app.getHttpServer()).post(`/projects/${uid}:getIamPolicy`).set(auth).send({});

        const setPolicy = (uid: string, auth: AuthHeader, policy: object): request.Test =>
            request(app.getHttpServer()).post(`/projects/${uid}:setIamPolicy`).set(auth).send({ policy });

        test("accepts a replace carrying the current etag and returns a new one", async () => {
            const ownerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);
            const owner = Authorization.forUser(ownerId);

            const { body: current } = await getPolicy(uid, owner).expect(HttpStatus.OK);

            const { body: updated } = await setPolicy(uid, owner, {
                etag: current.etag,
                bindings: [
                    { role: "roles/admin", members: [`user:${ownerId}`] },
                    { role: "roles/viewer", members: [`user:${UserFactory.createId()}`] },
                ],
            }).expect(HttpStatus.OK);

            expect(updated.etag).toEqual(expect.any(String));
            expect(updated.etag).not.toBe(current.etag);
        });

        test("rejects a replace carrying a stale etag with ABORTED", async () => {
            const ownerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);
            const owner = Authorization.forUser(ownerId);

            const { body: stale } = await getPolicy(uid, owner).expect(HttpStatus.OK);

            await setPolicy(uid, owner, {
                etag: stale.etag,
                bindings: [
                    { role: "roles/admin", members: [`user:${ownerId}`] },
                    { role: "roles/developer", members: [`user:${UserFactory.createId()}`] },
                ],
            }).expect(HttpStatus.OK);

            return setPolicy(uid, owner, {
                etag: stale.etag,
                bindings: [{ role: "roles/admin", members: [`user:${ownerId}`] }],
            })
                .expect(HttpStatus.CONFLICT)
                .expect((response) => expect(response.body.error.status).toBe("ABORTED"));
        });

        test("allows a blind replace without an etag (Google-style optional)", async () => {
            const ownerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);
            const owner = Authorization.forUser(ownerId);

            return setPolicy(uid, owner, {
                bindings: [{ role: "roles/admin", members: [`user:${ownerId}`] }],
            }).expect(HttpStatus.OK);
        });
    });

    describe("IAM groups", () => {
        const bindGroupRole = (uid: string, ownerId: string, role: string, group: string): request.Test =>
            request(app.getHttpServer())
                .post(`/projects/${uid}:setIamPolicy`)
                .set(Authorization.forUser(ownerId))
                .send({
                    policy: {
                        bindings: [
                            { role: "roles/admin", members: [`user:${ownerId}`] },
                            { role, members: [`group:${group}`] },
                        ], 
                    }, 
                });

        test("a role granted to a group reaches a caller the IdP puts in it", async () => {
            const ownerId = UserFactory.createId();
            const memberId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);

            await bindGroupRole(uid, ownerId, "roles/developer", "eng").expect(HttpStatus.OK);

            // The caller presents group eng via their identity -> holds the group's permissions.
            await request(app.getHttpServer())
                .post(`/projects/${uid}:testIamPermissions`)
                .set(Authorization.forUser(memberId, ["eng"]))
                .send({ permissions: ["sw.environments.create"] })
                .expect(HttpStatus.OK, { permissions: ["sw.environments.create"] });

            // The same caller without the group holds nothing.
            return request(app.getHttpServer())
                .post(`/projects/${uid}:testIamPermissions`)
                .set(Authorization.forUser(memberId))
                .send({ permissions: ["sw.environments.create"] })
                .expect(HttpStatus.OK, { permissions: [] });
        });

        test("getIamPolicy returns a group member verbatim (no expansion to users)", async () => {
            const ownerId = UserFactory.createId();
            const uid = await createProjectFor(ownerId);

            await bindGroupRole(uid, ownerId, "roles/viewer", "eng").expect(HttpStatus.OK);

            const { body } = await request(app.getHttpServer())
                .post(`/projects/${uid}:getIamPolicy`)
                .set(Authorization.forUser(ownerId))
                .send({})
                .expect(HttpStatus.OK);

            expect(body.bindings).toEqual(expect.arrayContaining([
                { role: "roles/viewer", members: ["group:eng"] },
            ]));
        });
    });
});
