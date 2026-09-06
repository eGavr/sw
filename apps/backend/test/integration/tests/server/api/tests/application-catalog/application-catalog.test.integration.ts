import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

describe("/applicationCatalog", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    // The suite runs against the fixture catalog (APPLICATION_CATALOG_FILE): platform lines plus one
    // offering per (platform, application) with versions newest-first — and no artifact locations,
    // those are the delivery layer's internals.
    test("publishes the platform lines and the deliverable applications, artifacts staying private", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/applicationCatalog")
            .set(Authorization.forUser(UserFactory.createId()))
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            name: "applicationCatalog",
            platforms: expect.arrayContaining([
                { name: "ubuntu", versions: ["24.04"] },
                { name: "android", versions: ["13", "34"] },
            ]),
            applications: expect.arrayContaining([
                {
                    platform: "ubuntu",
                    name: "com.google.chrome",
                    aliases: ["chrome"],
                    versions: ["141.0.7390.54", "140.0.7339.80", "128.0.6613.86", "126.0.6478.182"],
                },
                {
                    platform: "android",
                    name: "com.android.settings",
                    aliases: ["settings"],
                    versions: ["34", "13"],
                },
            ]),
        });

        expect(JSON.stringify(body)).not.toContain("catalog.test");
    });

    test("requires authentication", async () => {
        return request(app.getHttpServer())
            .get("/applicationCatalog")
            .expect(HttpStatus.UNAUTHORIZED);
    });
});
