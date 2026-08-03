import { LocalEnvironmentDataSource } from "../../../data/data-sources/compute/local/environment-data-source";
import { LocalComputeStore } from "../../../data/data-sources/compute/local/local-compute-store";
import { LocalSessionDataSource } from "../../../data/data-sources/compute/local/session-data-source";
import { EnvironmentRepository } from "../../../data/repositories/environment-repository";
import { SessionRepository } from "../../../data/repositories/session-repository";
import { AccountId } from "../../entities/account/account-id";
import { Application } from "../../entities/environment/application/application";
import { ApplicationKind } from "../../entities/environment/application/application-kind";
import { ApplicationList } from "../../entities/environment/application/application-list";
import { Environment } from "../../entities/environment/environment";
import { ApplicationNotAvailableError } from "../../entities/environment/error/application-not-available-error";
import { EnvironmentBusyError } from "../../entities/environment/error/environment-busy-error";
import { Platform } from "../../entities/environment/platform/platform";
import { PlatformName } from "../../entities/environment/platform/platform-name";

import { CreateSessionUseCase } from "./create-session-use-case";

describe("CreateSessionUseCase", () => {
    const chrome = { name: "chrome", version: "100", kind: "browser" };

    const build = async (): Promise<{ useCase: CreateSessionUseCase; environment: Environment }> => {
        const store = new LocalComputeStore();
        const environmentRepository = new EnvironmentRepository(new LocalEnvironmentDataSource(store));
        const sessionRepository = new SessionRepository(new LocalSessionDataSource(store));

        const environment = await environmentRepository.create({
            accountId: AccountId.create(),
            platform: Platform.create({ name: PlatformName.Linux, version: "22.04" }),
            applications: ApplicationList.create({
                applications: [Application.create({ name: "chrome", version: "100", kind: ApplicationKind.Browser })],
            }),
        });

        return { useCase: new CreateSessionUseCase(environmentRepository, sessionRepository), environment };
    };

    test("should create a session for a supported application", async () => {
        const { useCase, environment } = await build();

        const session = await useCase.execute({ params: { environmentId: environment.id, application: chrome } });

        expect(session.environmentId.getValue()).toBe(environment.id);
        expect(session.application.name).toBe("chrome");
    });

    test("should reject a second active session in the same environment", async () => {
        const { useCase, environment } = await build();

        await useCase.execute({ params: { environmentId: environment.id, application: chrome } });

        await expect(useCase.execute({ params: { environmentId: environment.id, application: chrome } }))
            .rejects.toBeInstanceOf(EnvironmentBusyError);
    });

    test("should reject an application the environment does not offer", async () => {
        const { useCase, environment } = await build();

        const firefox = { name: "firefox", version: "120", kind: "browser" };

        await expect(useCase.execute({ params: { environmentId: environment.id, application: firefox } }))
            .rejects.toBeInstanceOf(ApplicationNotAvailableError);
    });
});
