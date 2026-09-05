import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import { ProjectRepository } from "../../../../../../../src/application/interfaces/repositories/project-repository";
import {
    SessionAllocationRetry,
} from "../../../../../../../src/application/use-cases/sessions/create-session-use-case";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { User } from "../../../../../../../src/domain/entities/user/user";
import {
    WebDriverClient,
} from "../../../../../../../src/infrastructure/gateways/webdriver-session/webdriver-client";
import { WdModule } from "../../../../../../../src/presentation/http/wd/wd-module";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";

type AuthHeader = { authorization: string };

const chromeVersion = "141";
const nodeEndpoint = "http://127.0.0.1:47474";
const wdSessionId = "wd-retry-session";

// Allocation retries a transient shortage: a caller who freed an environment and immediately asks for
// another must get a session, not a 409 to retry by hand. Here the only matching environment starts
// busy (so the first attempt finds nothing free) and is freed mid-flight — the retry catches it.
describe("POST /sessions allocation retry", () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [WdModule] })
            .overrideProvider(WebDriverClient)
            .useValue({
                createSession: jest.fn(async (): Promise<string> => wdSessionId),
                deleteSession: jest.fn(),
                fetchCurrentSession: jest.fn(),
            })
            // A budget wide enough to span the mid-flight free, with a tight backoff so the test is quick.
            .overrideProvider(SessionAllocationRetry)
            .useValue(new SessionAllocationRetry(3_000, 50))
            .compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    // One executing chrome environment, currently busy (occupied), in a fresh project.
    const seedBusyEnvironment = async (): Promise<{ owner: AuthHeader, projectId: string, environmentId: string }> => {
        const externalId = UserFactory.createId();
        const projectRepository = app.get(ProjectRepository);
        const project = await projectRepository.create({
            name: `team-${externalId}`,
            createdBy: User.create({ externalId, providerType: "local" }),
        });
        await projectRepository.save(project);

        const environmentRepository = app.get(EnvironmentRepository);
        await environmentRepository.create({
            projectId: ProjectId.fromString(project.id),
            platform: Platform.fromObject({ name: "ubuntu", version: "24.04" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: chromeVersion }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        claimed.register(new EnvironmentEndpoint(nodeEndpoint), new Date());
        claimed.heartbeat(true, new Date());
        await environmentRepository.save(claimed);

        return { owner: Authorization.forUser(externalId), projectId: project.id, environmentId: claimed.id };
    };

    const freeEnvironment = (environmentId: string): Promise<unknown> =>
        app.get(EnvironmentRepository).with(
            EnvironmentId.fromString(environmentId),
            (environment) => environment.heartbeat(false, new Date()),
        );

    const createSession = (projectId: string, owner: AuthHeader): request.Test =>
        request(app.getHttpServer())
            .post("/sessions")
            .set(owner)
            .send({
                capabilities: {
                    alwaysMatch: { browserName: "chrome", browserVersion: chromeVersion, "sw:projectId": projectId },
                },
            });

    test("succeeds once the only matching environment is freed mid-flight", async () => {
        const { owner, projectId, environmentId } = await seedBusyEnvironment();

        const pending = createSession(projectId, owner);
        setTimeout(() => void freeEnvironment(environmentId), 300);

        const { body } = await pending.expect(HttpStatus.OK);
        expect(body.value.capabilities["sw:environmentId"]).toBe(environmentId);
    });

    test("still refuses with 409 when the shortage never clears within the budget", async () => {
        const { owner, projectId } = await seedBusyEnvironment();

        await createSession(projectId, owner).expect(HttpStatus.CONFLICT);
    });
});
