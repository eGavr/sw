import { HttpStatus } from "@nestjs/common";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { ApiModule } from "../../../../../../src/presentation/server/nestjs/modules/api/api-module";
import { TestingApp } from "../../utils/app/testing-app";

describe("/environments", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    describe("/:environmentId (GET)", () => {
        test("should response NOT_FOUND for non-existent environment id", () => {
            return request(app.getHttpServer())
                .get(`/environments/${uuidv4()}`)
                .set({ Authorization: "Bearer <token>" })
                .expect(HttpStatus.NOT_FOUND);
        });

        test("should response BAD_REQUEST for invalid environment id", () => {
            return request(app.getHttpServer())
                .get("/environments/{invalid-id}")
                .set({ Authorization: "Bearer <token>" })
                .expect(HttpStatus.BAD_REQUEST);
        });

        test("should response UNAUTHORIZED for unauthenticated request", () => {
            return request(app.getHttpServer())
                .get(`/environments/${uuidv4()}`)
                .expect(HttpStatus.UNAUTHORIZED);
        });
    });
});
