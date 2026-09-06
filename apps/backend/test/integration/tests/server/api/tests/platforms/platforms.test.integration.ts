import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

// The platform base-image lines are install infrastructure (read-only); the applications deliverable
// onto them are project resources covered by the project-applications suite.
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
                { name: "platforms/android", platform: "android", versions: ["13", "14"] },
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
