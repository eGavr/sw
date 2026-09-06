import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

// The suite runs against the fixture catalog (APPLICATION_CATALOG_FILE). The install's delivery
// catalog is published as read-only AIP resources: platform lines and, under each, the applications
// the install itself delivers — versions newest-first, artifact locations staying private.
describe("/platforms", () => {
    let app: TestingApp;

    const owner = (): { authorization: string } => Authorization.forUser(UserFactory.createId());

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    test("lists the platform base-image lines", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/platforms")
            .set(owner())
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            platforms: expect.arrayContaining([
                { name: "platforms/ubuntu", platform: "ubuntu", versions: ["24.04"] },
                { name: "platforms/android", platform: "android", versions: ["13", "34"] },
            ]),
        });
    });

    test("gets one platform line", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/platforms/ubuntu")
            .set(owner())
            .expect(HttpStatus.OK);

        expect(body).toEqual({ name: "platforms/ubuntu", platform: "ubuntu", versions: ["24.04"] });
    });

    test("lists a platform's deliverable applications, artifacts staying private", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/platforms/ubuntu/applications")
            .set(owner())
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            applications: [{
                name: "platforms/ubuntu/applications/com.google.chrome",
                application: "com.google.chrome",
                aliases: ["chrome"],
            }],
        });

        expect(JSON.stringify(body)).not.toContain("catalog.test");
    });

    test("gets one application by its canonical name", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/platforms/android/applications/com.android.settings")
            .set(owner())
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            name: "platforms/android/applications/com.android.settings",
            application: "com.android.settings",
            aliases: ["settings"],
        });
    });

    test("lists an application's versions newest-first, each its own resource", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/platforms/ubuntu/applications/com.google.chrome/versions")
            .set(owner())
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            versions: [
                { name: "platforms/ubuntu/applications/com.google.chrome/versions/141.0.7390.54", version: "141.0.7390.54" },
                { name: "platforms/ubuntu/applications/com.google.chrome/versions/140.0.7339.80", version: "140.0.7339.80" },
                { name: "platforms/ubuntu/applications/com.google.chrome/versions/128.0.6613.86", version: "128.0.6613.86" },
                { name: "platforms/ubuntu/applications/com.google.chrome/versions/126.0.6478.182", version: "126.0.6478.182" },
            ],
        });
    });

    test("gets one version", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/platforms/ubuntu/applications/com.google.chrome/versions/140.0.7339.80")
            .set(owner())
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            name: "platforms/ubuntu/applications/com.google.chrome/versions/140.0.7339.80",
            version: "140.0.7339.80",
        });
    });

    test("responds NOT_FOUND for a version the install does not deliver", async () => {
        return request(app.getHttpServer())
            .get("/platforms/ubuntu/applications/com.google.chrome/versions/1.0")
            .set(owner())
            .expect(HttpStatus.NOT_FOUND);
    });

    test("an alias is request vocabulary, not a resource id", async () => {
        return request(app.getHttpServer())
            .get("/platforms/android/applications/settings")
            .set(owner())
            .expect(HttpStatus.NOT_FOUND);
    });

    test("responds NOT_FOUND for a platform outside the catalog", async () => {
        return request(app.getHttpServer())
            .get("/platforms/ios")
            .set(owner())
            .expect(HttpStatus.NOT_FOUND);
    });

    test("requires authentication", async () => {
        return request(app.getHttpServer())
            .get("/platforms")
            .expect(HttpStatus.UNAUTHORIZED);
    });
});
