import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

describe("/storageDelegation", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    test("publishes the storage identity the user grants bucket access to", async () => {
        const { body } = await request(app.getHttpServer())
            .get("/storageDelegation")
            .set(Authorization.forUser(UserFactory.createId()))
            .expect(HttpStatus.OK);

        expect(body).toEqual({
            name: "storageDelegation",
            serviceAccountId: "aje-test-storage",
            role: "storage.editor",
            purpose: expect.any(String),
        });
    });

    test("responds UNAUTHENTICATED without a token", () => {
        return request(app.getHttpServer()).get("/storageDelegation").expect(HttpStatus.UNAUTHORIZED);
    });
});
