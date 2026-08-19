import { HttpStatus } from "@nestjs/common";
import request from "supertest";

import { ObjectStorageGateway } from "../../../../../../../src/application/interfaces/gateways/object-storage-gateway";
import {
    StorageDestinationRepository,
} from "../../../../../../../src/application/interfaces/repositories/storage-destination-repository";
import { ProjectId } from "../../../../../../../src/domain/entities/project/project-id";
import { SessionVideoKey } from "../../../../../../../src/domain/entities/storage/session-video-key";
import { StorageDestination } from "../../../../../../../src/domain/entities/storage/storage-destination";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { SessionRoute } from "../../../../../../../src/presentation/http/session-route";
import { TestingApp } from "../../../utils/app/testing-app";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { Authorization } from "../../../utils/request/headers/authorization";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };

const destination = StorageDestination.create({ bucket: "videos-bucket", prefix: "videos" });
const wdSessionId = "wd-session-vid-xyz";
const sessionId = SessionRoute.encode("http://node.internal:4444", wdSessionId);
const video = Buffer.from("fake-mp4-payload- -with spaces -end");

// supertest does not parse video/mp4, so collect the streamed body into a Buffer to compare bytes.
const collectBinary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void): void => {
    const chunks: Array<Buffer> = [];
    res.on("data", (chunk: Buffer) => chunks.push(chunk));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("GET /projects/:project/sessions/:sessionId/video", () => {
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

    const seedProjectWithVideo = async (): Promise<{ owner: AuthHeader, uid: string }> => {
        const owner = Authorization.forUser(UserFactory.createId());
        const uid = await createProject(owner);

        await app.app.get(StorageDestinationRepository).save(ProjectId.fromString(uid), destination);
        await app.app.get(ObjectStorageGateway).put(
            destination,
            destination.keyFor(SessionVideoKey.forSession(wdSessionId)),
            { body: video, contentType: "video/mp4" },
        );

        return { owner, uid };
    };

    const getVideo = (uid: string, sid: string, auth: AuthHeader): request.Test =>
        request(app.getHttpServer()).get(`/projects/${uid}/sessions/${sid}/video`).set(auth);

    test("streams a session's recording back to a member", async () => {
        const { owner, uid } = await seedProjectWithVideo();

        const response = await getVideo(uid, sessionId, owner).buffer(true).parse(collectBinary).expect(HttpStatus.OK);

        expect(response.headers["content-type"]).toContain("video/mp4");
        expect((response.body as Buffer).equals(video)).toBe(true);
    });

    test("responds PERMISSION_DENIED for a non-member", async () => {
        const { uid } = await seedProjectWithVideo();
        const stranger = Authorization.forUser(UserFactory.createId());

        return getVideo(uid, sessionId, stranger).expect(HttpStatus.FORBIDDEN);
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        const { uid } = await seedProjectWithVideo();

        return request(app.getHttpServer()).get(`/projects/${uid}/sessions/${sessionId}/video`).expect(HttpStatus.UNAUTHORIZED);
    });

    test("responds NOT_FOUND when no recording is stored for the session", async () => {
        const { owner, uid } = await seedProjectWithVideo();
        const otherSession = SessionRoute.encode("http://node.internal:4444", "wd-session-never-recorded");

        return getVideo(uid, otherSession, owner).expect(HttpStatus.NOT_FOUND);
    });

    test("responds INVALID_ARGUMENT for a malformed session id", async () => {
        const { owner, uid } = await seedProjectWithVideo();

        return getVideo(uid, "not-a-valid-session-id", owner).expect(HttpStatus.BAD_REQUEST);
    });
});
