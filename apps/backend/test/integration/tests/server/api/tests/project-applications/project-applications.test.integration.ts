import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

// The delivery catalog as project resources (the GCE vendor-project model): the reserved `catalog`
// project holds the install's provided set (seeded from CATALOG_SEED_FILE, admins from
// CATALOG_ADMIN_EXTERNAL_IDS = catalog-admin here); a user project registers its customs, a catalog
// word included — the catalog is the default, the project's own word overrides it. Every application
// is ONE word (its name alias) and a resource by its server id; its builds are version aliases with
// their artifacts.
describe("/projects/:project/platforms/:platform/applications", () => {
    let app: TestingApp;

    const catalogAdmin = Authorization.forUser("catalog-admin");
    const uuidPattern = /^[0-9a-f-]{36}$/;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const createProject = async (): Promise<{ owner: { authorization: string }, projectId: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(owner)
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        return { owner, projectId: body.uid };
    };

    const registerCustom = async (
        owner: { authorization: string },
        projectId: string,
        nameAlias: string,
    ): Promise<{ uid: string }> => {
        const { body } = await request(app.getHttpServer())
            .post(`/projects/${projectId}/platforms/android/applications`)
            .set(owner)
            .send({ nameAlias })
            .expect(HttpStatus.CREATED);

        return { uid: body.uid };
    };

    describe("the reserved catalog project", () => {
        test("its applications are readable by any authenticated caller, refs staying private", async () => {
            const stranger = Authorization.forUser(UserFactory.createId());

            const { body } = await request(app.getHttpServer())
                .get("/projects/catalog/platforms/ubuntu/applications")
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(body).toEqual({
                applications: [{
                    name: expect.stringMatching(/^projects\/catalog\/platforms\/ubuntu\/applications\/[0-9a-f-]{36}$/),
                    uid: expect.stringMatching(uuidPattern),
                    nameAlias: "chrome",
                    createTime: expect.any(String),
                }],
            });

            // The word is a handle too — the URL takes either the id or the alias.
            const { body: versions } = await request(app.getHttpServer())
                .get("/projects/catalog/platforms/ubuntu/applications/chrome/versions")
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(versions.versions.map((version: { versionAlias: string }) => version.versionAlias))
                .toEqual(["126", "128", "140", "141"]);
            // What a build delivers is public, where from is the install's own business.
            expect(versions.versions[0]).toEqual({
                name: expect.stringMatching(/\/applications\/[0-9a-f-]{36}\/versions\/[0-9a-f-]{36}$/),
                uid: expect.stringMatching(uuidPattern),
                versionAlias: "126",
                preinstalled: false,
                webdriver: true,
                createTime: expect.any(String),
            });
            expect(JSON.stringify(versions)).not.toContain("catalog.test");
        });

        test("lists are paged the AIP way: pageSize bounds a page, pageToken continues it", async () => {
            const stranger = Authorization.forUser(UserFactory.createId());

            const { body: first } = await request(app.getHttpServer())
                .get("/projects/catalog/platforms/ubuntu/applications/chrome/versions?pageSize=3")
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(first.versions.map((version: { versionAlias: string }) => version.versionAlias))
                .toEqual(["126", "128", "140"]);
            expect(first.nextPageToken).toEqual(expect.any(String));

            const { body: second } = await request(app.getHttpServer())
                .get(`/projects/catalog/platforms/ubuntu/applications/chrome/versions?pageSize=3&pageToken=${first.nextPageToken}`)
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(second.versions.map((version: { versionAlias: string }) => version.versionAlias)).toEqual(["141"]);
            expect(second.nextPageToken).toBeUndefined();
        });

        test("only its members may grow the provided set — and the admin from the env can", async () => {
            const stranger = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications")
                .set(stranger)
                .send({ nameAlias: "firefox" })
                .expect(HttpStatus.FORBIDDEN);

            const { body } = await request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications")
                .set(catalogAdmin)
                .send({ nameAlias: "firefox" })
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .post(`/projects/catalog/platforms/ubuntu/applications/${body.uid}/versions`)
                .set(catalogAdmin)
                .send({ versionAlias: "144", appRef: "https://catalog.test/firefox-144.zip" })
                .expect(HttpStatus.CREATED);
        });

        test("a word already taken on the catalog platform is refused", async () => {
            return request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications")
                .set(catalogAdmin)
                .send({ nameAlias: "chrome" })
                .expect(HttpStatus.CONFLICT);
        });

        test("the catalog project hosts nothing but applications", async () => {
            return request(app.getHttpServer())
                .post("/projects/catalog/cloudAccounts")
                .set(catalogAdmin)
                .send({ type: "local" })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("it is not listed among a stranger's projects", async () => {
            const stranger = Authorization.forUser(UserFactory.createId());

            const { body } = await request(app.getHttpServer())
                .get("/projects")
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(JSON.stringify(body)).not.toContain("catalog");
        });
    });

    describe("a user project's customs (overriding the catalog word for word)", () => {
        test("registers a custom with builds and echoes its own refs back", async () => {
            const { owner, projectId } = await createProject();

            const { body: application } = await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ nameAlias: "myapp" })
                .expect(HttpStatus.CREATED);

            expect(application).toEqual({
                name: `projects/${projectId}/platforms/android/applications/${application.uid}`,
                uid: expect.stringMatching(uuidPattern),
                nameAlias: "myapp",
                createTime: expect.any(String),
            });

            const { body: version } = await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications/${application.uid}/versions`)
                .set(owner)
                .send({ versionAlias: "7.1-rc2", appRef: "builds/app-7.1.apk", webdriverRef: "builds/driver-7.1" })
                .expect(HttpStatus.CREATED);

            // No declared version: a custom build is its label plus its artifacts — the true version
            // is detected at delivery, on the environment.
            expect(version).toEqual({
                name: `projects/${projectId}/platforms/android/applications/${application.uid}/versions/${version.uid}`,
                uid: expect.stringMatching(uuidPattern),
                versionAlias: "7.1-rc2",
                preinstalled: false,
                webdriver: true,
                appRef: "builds/app-7.1.apk",
                webdriverRef: "builds/driver-7.1",
                createTime: expect.any(String),
            });

            const { body: versions } = await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications/myapp/versions`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(versions).toEqual({ versions: [version] });
        });

        test("an application is addressed by its id or its word alike", async () => {
            const { owner, projectId } = await createProject();
            const { uid } = await registerCustom(owner, projectId, "myapp");

            const byId = await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications/${uid}`)
                .set(owner)
                .expect(HttpStatus.OK);
            const byWord = await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications/myapp`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(byWord.body).toEqual(byId.body);
        });

        test("a project may register a catalog word as its own — the override lives beside the catalog's", async () => {
            const { owner, projectId } = await createProject();

            const { body } = await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/ubuntu/applications`)
                .set(owner)
                .send({ nameAlias: "chrome" })
                .expect(HttpStatus.CREATED);
            expect(body.nameAlias).toBe("chrome");

            // Twice in one project is still a conflict.
            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/ubuntu/applications`)
                .set(owner)
                .send({ nameAlias: "chrome" })
                .expect(HttpStatus.CONFLICT);
        });

        test("the request knows no aliases", async () => {
            const { owner, projectId } = await createProject();

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ nameAlias: "myapp", aliases: ["other"] })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("a custom build must bring its artifact, and declared versions do not exist", async () => {
            const { owner, projectId } = await createProject();
            const { uid } = await registerCustom(owner, projectId, "myapp");

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications/${uid}/versions`)
                .set(owner)
                .send({ versionAlias: "7.1" })
                .expect(HttpStatus.BAD_REQUEST);

            // Declared versions died with the detected-identity model; the field is not even accepted.
            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications/${uid}/versions`)
                .set(owner)
                .send({ versionAlias: "7.1", version: "7.1.0", appRef: "builds/app.apk" })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("registrations are project-private", async () => {
            const { owner, projectId } = await createProject();
            const stranger = Authorization.forUser(UserFactory.createId());

            await registerCustom(owner, projectId, "myapp");

            await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications`)
                .set(stranger)
                .expect(HttpStatus.FORBIDDEN);
        });

        test("delete unregisters the application with its builds", async () => {
            const { owner, projectId } = await createProject();
            const { uid } = await registerCustom(owner, projectId, "myapp");

            await request(app.getHttpServer())
                .delete(`/projects/${projectId}/platforms/android/applications/${uid}`)
                .set(owner)
                .expect(HttpStatus.NO_CONTENT);

            await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications/myapp`)
                .set(owner)
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
