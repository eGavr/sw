import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    WebDriverSessionGateway,
} from "../../../../../../../src/application/interfaces/gateways/webdriver-session-gateway";
import {
    EnvironmentRepository,
} from "../../../../../../../src/application/interfaces/repositories/environment-repository";
import {
    SessionOwnershipRepository,
} from "../../../../../../../src/application/interfaces/repositories/session-ownership-repository";
import { ApplicationList } from "../../../../../../../src/domain/entities/environment/application/application-list";
import { EnvironmentEndpoint } from "../../../../../../../src/domain/entities/environment/environment-endpoint";
import { EnvironmentId } from "../../../../../../../src/domain/entities/environment/environment-id";
import { Platform } from "../../../../../../../src/domain/entities/environment/platform/platform";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { SessionOwnership } from "../../../../../../../src/domain/entities/session/session-ownership";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { SessionRoute } from "../../../../../../../src/presentation/http/session-route";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

const nodeEndpoint = "http://127.0.0.1:45454";
const wdSessionId = "wd-live-session-1";

// Recovery of the live session id: the node is the source of truth (its client is the one external
// mock), ownership metadata gates WHO may ask — only the session's creator; everyone else gets 404.
describe("GET /projects/:project/environments/:environment/session", () => {
    let app: INestApplication;
    let fetchCurrent: jest.Mock;

    beforeEach(async () => {
        fetchCurrent = jest.fn(async (): Promise<string | null> => wdSessionId);

        const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
            .overrideProvider(WebDriverSessionGateway)
            .useValue({ fetchCurrent })
            .compile();

        app = moduleRef.createNestApplication();
        app.enableShutdownHooks();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    const seedExecutingEnvironment = async (
        creatorExternalId: string,
    ): Promise<{ owner: { authorization: string }, projectUid: string, environmentId: string }> => {
        const owner = Authorization.forUser(creatorExternalId);
        const { body: project } = await request(app.getHttpServer())
            .post("/projects").set(owner).send(CreateProjectBody.create()).expect(HttpStatus.CREATED);

        const environmentRepository = app.get(EnvironmentRepository);
        await environmentRepository.create({
            projectId: ProjectId.fromString(project.uid),
            platform: Platform.fromObject({ name: "ubuntu", version: "24.04" }),
            applications: ApplicationList.fromObject([{ name: "chrome", version: "141" }]),
        });

        const claimed = await environmentRepository.withNextEnqueued((environment) => environment.claim());

        if (!claimed) {
            throw new Error("expected an enqueued environment to claim");
        }

        claimed.markDispatched();
        claimed.register(new EnvironmentEndpoint(nodeEndpoint), new Date());
        claimed.heartbeat(true, new Date());
        await environmentRepository.save(claimed);

        return { owner, projectUid: project.uid, environmentId: claimed.id };
    };

    const seedOwnership = async (environmentId: string, createdBy: string): Promise<void> => {
        await app.get(SessionOwnershipRepository).save(SessionOwnership.create({
            environmentId: EnvironmentId.fromString(environmentId),
            createdBy,
        }));
    };

    const getSession = (projectUid: string, environmentId: string, auth: { authorization: string }): request.Test =>
        request(app.getHttpServer()).get(`/projects/${projectUid}/environments/${environmentId}/session`).set(auth);

    test("returns the live capability id to the session's creator", async () => {
        const creator = UserFactory.createId();
        const { owner, projectUid, environmentId } = await seedExecutingEnvironment(creator);
        await seedOwnership(environmentId, creator);

        const { body } = await getSession(projectUid, environmentId, owner).expect(HttpStatus.OK);

        expect(SessionRoute.decode(body.sessionId)).toEqual({ endpoint: nodeEndpoint, webDriverSessionId: wdSessionId });
        expect(fetchCurrent).toHaveBeenCalledWith(nodeEndpoint);
    });

    test("responds NOT_FOUND to a project member who did not create the session", async () => {
        const creator = UserFactory.createId();
        const { owner, projectUid, environmentId } = await seedExecutingEnvironment(creator);
        // The session on this environment belongs to someone else.
        await seedOwnership(environmentId, UserFactory.createId());

        return getSession(projectUid, environmentId, owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds NOT_FOUND when no session was ever created on the environment", async () => {
        const creator = UserFactory.createId();
        const { owner, projectUid, environmentId } = await seedExecutingEnvironment(creator);

        return getSession(projectUid, environmentId, owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds NOT_FOUND when the node no longer holds a session (stale ownership)", async () => {
        fetchCurrent.mockResolvedValue(null);
        const creator = UserFactory.createId();
        const { owner, projectUid, environmentId } = await seedExecutingEnvironment(creator);
        await seedOwnership(environmentId, creator);

        return getSession(projectUid, environmentId, owner).expect(HttpStatus.NOT_FOUND);
    });

    // The Drive files.capabilities pattern: the list advertises the door only to whoever can open it.
    test("GET environments carries capabilities.canAccessCurrentSession only for the creator", async () => {
        const creator = UserFactory.createId();
        const { owner, projectUid, environmentId } = await seedExecutingEnvironment(creator);
        await seedOwnership(environmentId, creator);

        const { body: mine } = await request(app.getHttpServer())
            .get(`/projects/${projectUid}/environments`).set(owner).expect(HttpStatus.OK);
        expect(mine.environments[0].capabilities).toEqual({ canAccessCurrentSession: true });

        // Replace the owner with someone else -> the capability disappears from the caller's view.
        await seedOwnership(environmentId, UserFactory.createId());
        const { body: foreign } = await request(app.getHttpServer())
            .get(`/projects/${projectUid}/environments`).set(owner).expect(HttpStatus.OK);
        expect(foreign.environments[0].capabilities).toBeUndefined();
    });

    test("responds NOT_FOUND for an unknown environment", async () => {
        const creator = UserFactory.createId();
        const { owner, projectUid } = await seedExecutingEnvironment(creator);

        return getSession(projectUid, uuidv4(), owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const creator = UserFactory.createId();
        const { projectUid, environmentId } = await seedExecutingEnvironment(creator);

        return request(app.getHttpServer())
            .get(`/projects/${projectUid}/environments/${environmentId}/session`)
            .expect(HttpStatus.UNAUTHORIZED);
    });
});
