import { BadRequestException, INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import { AccountRepository } from "../../../../../../../src/application/interfaces/repositories/account-repository";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    ProviderAccountRepository,
} from "../../../../../../../src/application/interfaces/repositories/provider-account-repository";
import {
    RecordEnvironmentHeartbeatUseCase,
} from "../../../../../../../src/application/use-cases/environments/record-environment-heartbeat-use-case";
import { AccountId } from "../../../../../../../src/domain/entities/account/account-id";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { Environment } from "../../../../../../../src/domain/entities/environment/environment";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { EnvironmentState } from "../../../../../../../src/domain/entities/environment/environment-state";
import { EnvironmentStatus } from "../../../../../../../src/domain/entities/environment/environment-status";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProviderAccountId } from "../../../../../../../src/domain/entities/provider-account/provider-account-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import { ClassValidatorError } from "../../../../../../../src/domain/utils/class-validator/class-validator-error";
import { AccountDataSource } from "../../../../../../../src/infrastructure/data-sources/database/postgres/account-data-source";
import {
    EnvironmentDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/environment-data-source";
import {
    ProviderAccountDataSource,
} from "../../../../../../../src/infrastructure/data-sources/database/postgres/provider-account-data-source";
import { PostgresModule } from "../../../../../../../src/infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import { AccountRepositoryImpl } from "../../../../../../../src/infrastructure/repositories/account-repository-impl";
import {
    EnvironmentRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/environment-repository-impl";
import {
    ProviderAccountRepositoryImpl,
} from "../../../../../../../src/infrastructure/repositories/provider-account-repository-impl";
import { AipExceptionFilter } from "../../../../../../../src/presentation/http/filters/aip-exception-filter";
import { ResponseInterceptor } from "../../../../../../../src/presentation/http/interceptors/response-interceptor";
import {
    InternalEnvironmentsController,
} from "../../../../../../../src/presentation/http/internal/controllers/environments/environments-controller";
import { UserFactory } from "../../../utils/entities/user/user-factory";

const endpoint = "http://127.0.0.1:44444";

describe("/internal/environments/:id:heartbeat", () => {
    let app: INestApplication;
    let environmentRepository: EnvironmentRepository;

    let accountRepository: AccountRepository;
    let providerAccountRepository: ProviderAccountRepository;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                PostgresModule,
                LoggerModule,
            ],
            controllers: [InternalEnvironmentsController],
            providers: [
                RecordEnvironmentHeartbeatUseCase,
                AccountDataSource,
                ProviderAccountDataSource,
                EnvironmentDataSource,
                { provide: AccountRepository, useClass: AccountRepositoryImpl },
                { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
                { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
                { provide: APP_FILTER, useClass: AipExceptionFilter },
                { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
                {
                    provide: APP_PIPE,
                    useValue: new ValidationPipe({
                        whitelist: true,
                        forbidNonWhitelisted: true,
                        exceptionFactory: (errors): BadRequestException =>
                            new BadRequestException(ClassValidatorError.stringifyConstraints(errors[0])),
                    }),
                },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();

        environmentRepository = app.get(EnvironmentRepository);
        accountRepository = app.get(AccountRepository);
        providerAccountRepository = app.get(ProviderAccountRepository);
    });

    afterEach(async () => {
        await app.close();
    });

    const seedEnvironment = async (): Promise<string> => {
        const externalId = UserFactory.createId();
        const account = await accountRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await accountRepository.save(account);

        const providerAccount = await providerAccountRepository.create({
            accountId: AccountId.fromString(account.id),
            providerType: "local",
        });

        const environment = await environmentRepository.create({
            accountId: AccountId.fromString(account.id),
            providerAccountId: ProviderAccountId.fromString(providerAccount.id),
            platform: Platform.fromObject({ name: "linux", version: "latest" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "latest" }]),
        });

        return environment.id;
    };

    // enqueued -> starting -> preparing (what the worker leaves before the agent registers).
    const seedPreparingEnvironment = async (): Promise<string> => {
        await seedEnvironment();

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        await environmentRepository.save(claimed);

        return claimed.id;
    };

    const heartbeat = (id: string, body: object): request.Test =>
        request(app.getHttpServer()).post(`/internal/environments/${id}:heartbeat`).send(body);

    const reload = (id: string): Promise<Environment> => environmentRepository.get(EnvironmentId.fromString(id));

    test("registers on the first heartbeat: preparing -> executing with the endpoint", async () => {
        const id = await seedPreparingEnvironment();

        const { body } = await heartbeat(id, { endpoint, busy: false }).expect(200);

        expect(body).toEqual({ uid: id, state: EnvironmentStatus.Active });

        const environment = await reload(id);
        expect(environment.state).toBe(EnvironmentState.Executing);
        expect(environment.endpoint).toBe(endpoint);
        expect(environment.busy).toBe(false);
    });

    test("a later heartbeat updates busy and refreshes liveness", async () => {
        const id = await seedPreparingEnvironment();
        await heartbeat(id, { endpoint, busy: false }).expect(200);

        await heartbeat(id, { busy: true }).expect(200);

        expect((await reload(id)).busy).toBe(true);
    });

    test("responds INVALID_ARGUMENT when the registration heartbeat omits the endpoint", async () => {
        const id = await seedPreparingEnvironment();

        return heartbeat(id, { busy: false })
            .expect(400)
            .expect((response) => expect(response.body.error.status).toBe("INVALID_ARGUMENT"));
    });

    test("responds ABORTED for a heartbeat on an environment that is not provisioning", async () => {
        const id = await seedEnvironment(); // still enqueued

        return heartbeat(id, { endpoint, busy: false })
            .expect(409)
            .expect((response) => expect(response.body.error.status).toBe("ABORTED"));
    });

    test("responds NOT_FOUND for a non-existent environment", () => {
        return heartbeat(uuidv4(), { endpoint, busy: false }).expect(404);
    });

    test("responds INVALID_ARGUMENT for a malformed environment id", () => {
        return heartbeat("not-a-uuid", { endpoint, busy: false }).expect(400);
    });

    test("responds NOT_FOUND for an unknown custom verb", async () => {
        const id = await seedPreparingEnvironment();

        return request(app.getHttpServer()).post(`/internal/environments/${id}:frobnicate`).send({ busy: false }).expect(404);
    });
});
