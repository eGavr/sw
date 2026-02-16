import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ApiModule } from "../../../../../../src/presentation/server/nestjs/modules/api/api-module";
import { TestingApp } from "../../utils/app/testing-app";
import { CreateAccountBody } from "../../utils/request/body/create-account-body";
import { Authorization } from "../../utils/request/headers/authorization";

describe("/accounts", () => {
    let app: TestingApp;

    beforeEach(async() => {
        app = await TestingApp.create(ApiModule);
    });

    describe("/ (POST)", () => {
        test("should response BAD_REQUEST when body schema is invalid", () => {
            const invalidAccountNameType = 1234567890;

            return request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create({ name: invalidAccountNameType }))
                .set(Authorization.SuperUser)
                .expect(HttpStatus.BAD_REQUEST)
                .expect((resp) => expect(resp.body.message).toBe("name must be a string"));
        });

        test("should response BAD_REQUEST when input contains invalid values", async () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create({ name: "???" }))
                .set(Authorization.SuperUser)
                .expect(HttpStatus.BAD_REQUEST)
                .expect(/account name: .+/);
        });

        test("should response UNAUTHORIZED for unauthenticated request", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create())
                .expect(HttpStatus.UNAUTHORIZED)
                .expect({ statusCode: HttpStatus.UNAUTHORIZED, message: "Unauthorized" });
        });

        test("should response UNAUTHORIZED in case of invalid authentication", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create())
                .set(Authorization.InvalidToken)
                .expect({ statusCode: HttpStatus.UNAUTHORIZED, message: "Unauthorized" });
        });

        test("should response FORBIDDEN when user is not alowed to create an account", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create())
                .set(Authorization.UserWithoutPermissions)
                .expect(HttpStatus.FORBIDDEN)
                .expect(/user: no permission: account:create/);
        });

        test("should response with created account", async () => {
            const accountName = "awesome-account-name";

            const { body: account } = await request(app.getHttpServer())
                .post("/accounts")
                .send(CreateAccountBody.create({ name: accountName }))
                .set(Authorization.SuperUser)
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .get(`/acounts/${account.id}`)
                .set(Authorization.SuperUser)
                .expect({
                    statusCode: HttpStatus.OK,
                    body: account,
                });
        });
    });
});
