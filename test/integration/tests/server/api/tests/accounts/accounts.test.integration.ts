import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { PermissionList } from "../../../../../../../src/domain/entities/permission/permission-list";
import { ApiModule } from "../../../../../../../src/presentation/server/nestjs/modules/api/api-module";
import { TestingApp } from "../../utils/app/testing-app";
import { LocalUserFactory } from "../../utils/entities/user/local-user-factory";
import { CreateAccountBody } from "../../utils/request/body/create-account-body";
import { LocalAuthorizationHeaderFactory } from "../../utils/request/headers/local-authorization-header-factory";

describe("/accounts", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    describe("/ (POST)", () => {
        test("should response BAD_REQUEST when body schema is invalid", () => {
            const invalidAccountNameType = 1234567890;

            return request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(LocalUserFactory.createUserWhoCanCreateAccount()))
                .send(CreateAccountBody.create({ name: invalidAccountNameType }))
                .expect(HttpStatus.BAD_REQUEST)
                .expect((resp) => expect(resp.body.message).toBe("name must be a string"));
        });

        test("should response BAD_REQUEST when input contains invalid values", async () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(LocalUserFactory.createUserWhoCanCreateAccount()))
                .send(CreateAccountBody.create({ name: "???" }))
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
                .set(LocalAuthorizationHeaderFactory.createInvalidToken())
                .send(CreateAccountBody.create())
                .expect({ statusCode: HttpStatus.UNAUTHORIZED, message: "Unauthorized" });
        });

        test("should response FORBIDDEN when user is not alowed to create an account", () => {
            return request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(LocalUserFactory.createUserWithoutPermissions()))
                .send(CreateAccountBody.create())
                .expect(HttpStatus.FORBIDDEN)
                .expect(/user: no permission: account:create/);
        });

        test("should response with created account", async () => {
            const user = LocalUserFactory.createUserWhoCanCreateAccount();

            const { body: account } = await request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(user))
                .send(CreateAccountBody.create({ 
                    name: "foo-name", 
                    resources: { providerId: "bar-provider-id", providerType: "baz-provider-type" }, 
                }))
                .expect(HttpStatus.CREATED);

            expect(account).toEqual({ 
                id: expect.any(String), 
                createdBy: expect.any(String), 
                name: "foo-name", 
                resources: { providerId: "bar-provider-id", providerType: "baz-provider-type" }, 
            });
        });

        test.only("should support creating multiple accounts for a user", async () => {
            const user = LocalUserFactory.createUserWhoCanCreateAccount();

            await request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(user))
                .send(CreateAccountBody.create({ name: "first-account-name" }))
                .expect(HttpStatus.CREATED);

            await request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(user))
                .send(CreateAccountBody.create({ name: "second-account-name" }))
                .expect(HttpStatus.CREATED);
        });

        test("should grant all permissions to the user after creating an account", async () => {
            const user = LocalUserFactory.createUserWhoCanCreateAccount();

            const { body: account } = await request(app.getHttpServer())
                .post("/accounts")
                .set(LocalAuthorizationHeaderFactory.createForUser(user))
                .send(CreateAccountBody.create())
            
            await request(app.getHttpServer())
                .get(`/accounts/${account.id}/permissions`)
                .set(LocalAuthorizationHeaderFactory.createForUser(user))
                .expect(HttpStatus.OK, { permissions: PermissionList.getAll().toArray() });
        });
    });
});
