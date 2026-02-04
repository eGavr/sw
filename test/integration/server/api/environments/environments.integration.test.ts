import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types";
import { v4 as uuidv4 } from "uuid";

import { ApiModule } from "../../../../../src/presentation/server/nestjs/modules/api/api-module";

describe("/environments", () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [ApiModule],
        }).compile();

        app = moduleFixture.createNestApplication();

        await app.init();
    });

    describe("/:environmentId (GET)", () => {
        test("must return NOT_FOUND for non-existent environment id", () => {
            return request(app.getHttpServer())
                .get(`/environments/${uuidv4()}`)
                .expect(HttpStatus.NOT_FOUND);
        });

        test("must return BAD_REQUEST for invalid environment id", () => {
            return request(app.getHttpServer())
                .get("/environments/{invalid-id}")
                .expect(HttpStatus.BAD_REQUEST);
        });
    });
});
