import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

// The delivery catalog as project resources (the GCE vendor-project model): the reserved `catalog`
// project holds the install's provided set (seeded from CATALOG_SEED_FILE, admins from
// CATALOG_ADMIN_EXTERNAL_IDS = catalog-admin here); a user project registers its customs under the
// docker rule — catalog words are reserved install-wide, a custom lives under its canonical name.
describe("/projects/:project/platforms/:platform/applications", () => {
    let app: TestingApp;

    const catalogAdmin = Authorization.forUser("catalog-admin");

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

    describe("the reserved catalog project", () => {
        test("its applications are readable by any authenticated caller, refs staying private", async () => {
            const stranger = Authorization.forUser(UserFactory.createId());

            const { body } = await request(app.getHttpServer())
                .get("/projects/catalog/platforms/ubuntu/applications")
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(body.applications).toEqual([{
                name: "projects/catalog/platforms/ubuntu/applications/com.google.chrome",
                application: "com.google.chrome",
                aliases: ["chrome"],
                createTime: expect.any(String),
            }]);

            const { body: versions } = await request(app.getHttpServer())
                .get("/projects/catalog/platforms/ubuntu/applications/com.google.chrome/versions")
                .set(stranger)
                .expect(HttpStatus.OK);

            expect(versions.versions.map((version: { version: string }) => version.version))
                .toEqual(["141.0.7390.54", "140.0.7339.80", "128.0.6613.86", "126.0.6478.182"]);
            expect(JSON.stringify(versions)).not.toContain("catalog.test");
        });

        test("only its members may grow the provided set — and the admin from the env can", async () => {
            const stranger = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications")
                .set(stranger)
                .send({ name: "org.mozilla.firefox", aliases: ["firefox"] })
                .expect(HttpStatus.FORBIDDEN);

            await request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications")
                .set(catalogAdmin)
                .send({ name: "org.mozilla.firefox", aliases: ["firefox"] })
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications/org.mozilla.firefox/versions")
                .set(catalogAdmin)
                .send({ version: "144.0.1", appRef: "https://catalog.test/firefox-144.zip" })
                .expect(HttpStatus.CREATED);
        });

        test("a word ambiguous within the catalog platform is refused", async () => {
            return request(app.getHttpServer())
                .post("/projects/catalog/platforms/ubuntu/applications")
                .set(catalogAdmin)
                .send({ name: "org.chromium.chrome", aliases: ["chrome"] })
                .expect(HttpStatus.BAD_REQUEST);
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

    describe("a user project's customs (the docker rule)", () => {
        test("registers a custom with builds and echoes its own refs back", async () => {
            const { owner, projectId } = await createProject();

            const { body: application } = await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ name: "com.mycorp.app" })
                .expect(HttpStatus.CREATED);

            expect(application).toEqual({
                name: `projects/${projectId}/platforms/android/applications/com.mycorp.app`,
                application: "com.mycorp.app",
                aliases: [],
                createTime: expect.any(String),
            });

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications/com.mycorp.app/versions`)
                .set(owner)
                .send({ version: "7.1.0", appRef: "builds/app-7.1.0.apk", webdriverRef: "builds/driver-7.1.0" })
                .expect(HttpStatus.CREATED);

            const { body: versions } = await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications/com.mycorp.app/versions`)
                .set(owner)
                .expect(HttpStatus.OK);

            expect(versions.versions).toEqual([{
                name: `projects/${projectId}/platforms/android/applications/com.mycorp.app/versions/7.1.0`,
                version: "7.1.0",
                appRef: "builds/app-7.1.0.apk",
                webdriverRef: "builds/driver-7.1.0",
            }]);
        });

        test("a custom may not take a catalog word, and aliases are catalog vocabulary", async () => {
            const { owner, projectId } = await createProject();

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/ubuntu/applications`)
                .set(owner)
                .send({ name: "com.google.chrome" })
                .expect(HttpStatus.BAD_REQUEST);

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ name: "com.mycorp.app", aliases: ["myapp"] })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("a custom build must bring its artifact", async () => {
            const { owner, projectId } = await createProject();

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ name: "com.mycorp.app" })
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications/com.mycorp.app/versions`)
                .set(owner)
                .send({ version: "7.1.0" })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("registrations are project-private", async () => {
            const { owner, projectId } = await createProject();
            const stranger = Authorization.forUser(UserFactory.createId());

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ name: "com.mycorp.app" })
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications`)
                .set(stranger)
                .expect(HttpStatus.FORBIDDEN);
        });

        test("delete unregisters the application with its builds", async () => {
            const { owner, projectId } = await createProject();

            await request(app.getHttpServer())
                .post(`/projects/${projectId}/platforms/android/applications`)
                .set(owner)
                .send({ name: "com.mycorp.app" })
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .delete(`/projects/${projectId}/platforms/android/applications/com.mycorp.app`)
                .set(owner)
                .expect(HttpStatus.NO_CONTENT);

            await request(app.getHttpServer())
                .get(`/projects/${projectId}/platforms/android/applications/com.mycorp.app`)
                .set(owner)
                .expect(HttpStatus.NOT_FOUND);
        });
    });
});
