import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ObjectStorageGateway } from "../../../../../../../src/application/interfaces/gateways/object-storage-gateway";
import {
    StorageDestinationRepository,
} from "../../../../../../../src/application/interfaces/repositories/storage-destination-repository";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { SessionLogKey } from "../../../../../../../src/domain/entities/storage/session-log-key";
import { StorageDestination } from "../../../../../../../src/domain/entities/storage/storage-destination";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { SessionRoute } from "../../../../../../../src/presentation/http/session-route";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

const destination = StorageDestination.create({ bucket: "logs-bucket", prefix: "logs" });
const wdSessionId = "wd-session-xyz";
const sessionId = SessionRoute.encode("http://node.internal:4444", wdSessionId);
const logs = "session started\nGET /url 200\nsession ended\n";

describe("GET /projects/:project/sessions/:sessionId/logs", () => {
    let app: TestingApp;

    beforeEach(async () => {
        app = await TestingApp.create(ApiModule);
    });

    afterEach(async () => {
        await app.close();
    });

    const createProject = async (owner: AuthHeader): Promise<string> => {
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(owner)
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        return body.uid;
    };

    // A project with a storage destination configured and one session's log already written to it.
    const seedProjectWithLog = async (): Promise<{ owner: AuthHeader, uid: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const uid = await createProject(owner);

        await app.app.get(StorageDestinationRepository).save(ProjectId.fromString(uid), destination);
        await app.app.get(ObjectStorageGateway)
            .put(destination, destination.keyFor(SessionLogKey.forSession(wdSessionId)), { body: Buffer.from(logs) });

        return { owner, uid };
    };

    const getLogs = (uid: string, sid: string, auth: AuthHeader): request.Test =>
        request(app.getHttpServer()).get(`/projects/${uid}/sessions/${sid}/logs`).set(auth);

    test("returns a session's log content to a member", async () => {
        const { owner, uid } = await seedProjectWithLog();

        const { body } = await getLogs(uid, sessionId, owner).expect(HttpStatus.OK);

        expect(body).toEqual({ content: logs });
    });

    test("responds PERMISSION_DENIED for a non-member", async () => {
        const { uid } = await seedProjectWithLog();
        const stranger = Authorization.forUser(UserFactory.createId());

        return getLogs(uid, sessionId, stranger)
            .expect(HttpStatus.FORBIDDEN)
            .expect((response) => expect(response.body.error.status).toBe("PERMISSION_DENIED"));
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const { uid } = await seedProjectWithLog();

        return request(app.getHttpServer()).get(`/projects/${uid}/sessions/${sessionId}/logs`).expect(HttpStatus.UNAUTHORIZED);
    });

    test("responds NOT_FOUND when no log is stored for the session", async () => {
        const { owner, uid } = await seedProjectWithLog();
        const otherSession = SessionRoute.encode("http://node.internal:4444", "wd-session-never-ran");

        return getLogs(uid, otherSession, owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds NOT_FOUND when the project has no storage destination", async () => {
        const owner = Authorization.forUser(UserFactory.createId());
        const uid = await createProject(owner);

        return getLogs(uid, sessionId, owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds INVALID_ARGUMENT for a malformed session id", async () => {
        const { owner, uid } = await seedProjectWithLog();

        return getLogs(uid, "not-a-valid-session-id", owner).expect(HttpStatus.BAD_REQUEST);
    });
});
