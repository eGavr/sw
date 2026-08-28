import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

describe("/cloudTypes", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    test("lists the connectable cloud types with the substrates each provisions", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/cloudTypes")
            .set(Authorization.forUser(UserFactory.createId()))
            .expect(HttpStatus.OK);

        expect(body.cloudTypes).toEqual(expect.arrayContaining([
            {
                name: "cloudTypes/local",
                type: "local",
                provides: [{ platform: "linux", execution: "container" }],
            },
            {
                name: "cloudTypes/yandex-cloud",
                type: "yandex-cloud",
                provides: [{ platform: "android", execution: "container" }],
            },
        ]));
    });

    test("responds UNAUTHENTICATED without a token", () => {
        return request(app.getHttpServer()).get("/cloudTypes").expect(HttpStatus.UNAUTHORIZED);
    });
});
