import { LocalComputeStore } from "../../../data/data-sources/compute/local/local-compute-store";
import { LocalSessionDataSource } from "../../../data/data-sources/compute/local/session-data-source";
import { AccountRepository } from "../../../data/repositories/account-repository";
import { AccountUserPermissionRepository } from "../../../data/repositories/account-user-permission-repository";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { SessionRepository } from "../../../data/repositories/session-repository";
import { UserRepository } from "../../../data/repositories/user-repository";
import { AccountId } from "../../entities/account/account-id";
import { Application } from "../../entities/environment/application/application";
import { ApplicationList } from "../../entities/environment/application/application-list";
import { Environment } from "../../entities/environment/environment";
import { ApplicationNotAvailableError } from "../../entities/environment/error/application-not-available-error";
import { EnvironmentBusyError } from "../../entities/environment/error/environment-busy-error";
import { Platform } from "../../entities/environment/platform/platform";
import { PlatformName } from "../../entities/environment/platform/platform-name";
import { PermissionDeniedError } from "../../entities/error/permission-denied-error";
import { User } from "../../entities/user/user";

import { CreateSessionUseCase } from "./create-session-use-case";

describe("CreateSessionUseCase", () => {
    const creds = { token: "test-token" };
    const chrome = { name: "chrome", version: "100" };

    const authenticatedUserRepository = {
        find: async (): Promise<User> => User.create({ externalId: "tester", providerType: "local" }),
    } as unknown as UserRepository;

    const accountRepository = { get: async (): Promise<object> => ({}) } as unknown as AccountRepository;

    const permissionRepository = (authorized: boolean): AccountUserPermissionRepository =>
        ({
            findAll: async (): Promise<{ find: () => boolean }> => ({ find: (): boolean => authorized }),
        }) as unknown as AccountUserPermissionRepository;

    const build = (authorized = true): { useCase: CreateSessionUseCase; environment: Environment } => {
        const sessionRepository = new SessionRepository(new LocalSessionDataSource(new LocalComputeStore()));

        const environment = Environment.create({
            accountId: AccountId.create(),
            platform: Platform.create({ name: PlatformName.Linux, version: "22.04" }),
            applications: ApplicationList.create({ applications: [Application.create({ name: "chrome", version: "100" })] }),
        });

        const environmentRepository = {
            get: async (): Promise<Environment> => environment,
        } as unknown as EnvironmentRepository;

        return {
            useCase: new CreateSessionUseCase(
                authenticatedUserRepository,
                permissionRepository(authorized),
                accountRepository,
                environmentRepository,
                sessionRepository,
            ),
            environment,
        };
    };

    test("should create a session for a supported application", async () => {
        const { useCase, environment } = build();

        const session = await useCase.execute({ creds, params: { environmentId: environment.id, application: chrome } });

        expect(session.environmentId.getValue()).toBe(environment.id);
        expect(session.application.name).toBe("chrome");
    });

    test("should reject a second active session in the same environment", async () => {
        const { useCase, environment } = build();

        await useCase.execute({ creds, params: { environmentId: environment.id, application: chrome } });

        await expect(useCase.execute({ creds, params: { environmentId: environment.id, application: chrome } }))
            .rejects.toBeInstanceOf(EnvironmentBusyError);
    });

    test("should reject an application the environment does not offer", async () => {
        const { useCase, environment } = build();

        const firefox = { name: "firefox", version: "120" };

        await expect(useCase.execute({ creds, params: { environmentId: environment.id, application: firefox } }))
            .rejects.toBeInstanceOf(ApplicationNotAvailableError);
    });

    test("should reject a user without the session:create permission", async () => {
        const { useCase, environment } = build(false);

        await expect(useCase.execute({ creds, params: { environmentId: environment.id, application: chrome } }))
            .rejects.toBeInstanceOf(PermissionDeniedError);
    });
});
