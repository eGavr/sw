import { HttpStatus, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, JWTVerifyGetKey, SignJWT } from "jose";
import request from "supertest";

import {
    OidcTokenVerifier,
} from "../../../../../../../src/infrastructure/data-sources/auth/oidc/oidc-token-verifier";
import {
    OidcUserDataSource,
} from "../../../../../../../src/infrastructure/data-sources/auth/oidc/user-data-source";
import { UserDataSource } from "../../../../../../../src/infrastructure/data-sources/auth/user-data-source";
import { ApiModule } from "../../../../../../../src/presentation/http/api/api-module";
import { UserFactory } from "../../../utils/entities/user/user-factory";
import { CreateProjectBody } from "../../utils/request/body/create-project-body";

type AuthHeader = { authorization: string };
type KeyPair = Awaited<ReturnType<typeof generateKeyPair>>;

type SignOptions = {
    subject: string;
    groups?: ReadonlyArray<string>;
    issuer?: string;
    audience?: string;
    expiration?: number | string;
    key?: KeyPair["privateKey"];
};

const issuer = "https://idp.test/";
const audience = "sw";
const groupsClaim = "groups";
const kid = "oidc-test-key";

// The OIDC data source is exercised for real (real signature check via `jose`); only the JWKS is served
// locally instead of over the network, standing in for the external IdP.
describe("OIDC bearer authentication", () => {
    let app: INestApplication;
    let keyPair: KeyPair;
    let unknownKeyPair: KeyPair;
    let keys: JWTVerifyGetKey;

    beforeAll(async () => {
        keyPair = await generateKeyPair("RS256", { extractable: true });
        unknownKeyPair = await generateKeyPair("RS256", { extractable: true });
        const publicJwk = await exportJWK(keyPair.publicKey);
        keys = createLocalJWKSet({ keys: [{ ...publicJwk, kid, alg: "RS256", use: "sig" }] });
    });

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({ imports: [ApiModule] })
            .overrideProvider(UserDataSource)
            .useValue(new OidcUserDataSource(new OidcTokenVerifier(keys, { issuer, audience, groupsClaim })))
            .compile();

        app = moduleRef.createNestApplication();
        app.enableShutdownHooks();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    const sign = (options: SignOptions): Promise<string> =>
        new SignJWT(options.groups ? { [groupsClaim]: options.groups } : {})
            .setProtectedHeader({ alg: "RS256", kid })
            .setSubject(options.subject)
            .setIssuer(options.issuer ?? issuer)
            .setAudience(options.audience ?? audience)
            .setIssuedAt()
            .setExpirationTime(options.expiration ?? "5m")
            .sign(options.key ?? keyPair.privateKey);

    const bearer = (token: string): AuthHeader => ({ authorization: `Bearer ${token}` });

    const tokenFor = async (subject: string, groups?: ReadonlyArray<string>): Promise<AuthHeader> =>
        bearer(await sign({ subject, groups }));

    const createProject = async (auth: AuthHeader): Promise<string> => {
        const { body } = await request(app.getHttpServer())
            .post("/projects")
            .set(auth)
            .send(CreateProjectBody.create())
            .expect(HttpStatus.CREATED);

        return body.uid;
    };

    const getProject = (uid: string, auth: AuthHeader): request.Test =>
        request(app.getHttpServer()).get(`/projects/${uid}`).set(auth);

    test("authenticates a valid signed token as its subject", async () => {
        const aliceId = UserFactory.createId();
        const alice = await tokenFor(aliceId);

        const uid = await createProject(alice);

        await getProject(uid, alice).expect(HttpStatus.OK);
    });

    test("scopes access to the token's subject", async () => {
        const alice = await tokenFor(UserFactory.createId());
        const uid = await createProject(alice);

        const bob = await tokenFor(UserFactory.createId());

        await getProject(uid, bob).expect(HttpStatus.FORBIDDEN);
    });

    test("resolves IAM group membership from the groups claim", async () => {
        const ownerId = UserFactory.createId();
        const owner = await tokenFor(ownerId);
        const uid = await createProject(owner);

        await request(app.getHttpServer())
            .post(`/projects/${uid}:setIamPolicy`)
            .set(owner)
            .send({
                policy: {
                    bindings: [
                        { role: "roles/admin", members: [`user:${ownerId}`] },
                        { role: "roles/viewer", members: ["group:eng"] },
                    ],
                },
            })
            .expect(HttpStatus.OK);

        const memberId = UserFactory.createId();

        await getProject(uid, await tokenFor(memberId, ["eng"])).expect(HttpStatus.OK);
        await getProject(uid, await tokenFor(memberId)).expect(HttpStatus.FORBIDDEN);
    });

    test("responds UNAUTHENTICATED without a token", async () => {
        await request(app.getHttpServer())
            .post("/projects")
            .send(CreateProjectBody.create())
            .expect(HttpStatus.UNAUTHORIZED);
    });

    const tamper = (token: string): string => {
        const [header, payload, signature] = token.split(".");

        return [header, payload, (signature[0] === "A" ? "B" : "A") + signature.slice(1)].join(".");
    };

    const expiredEpochSeconds = (): number => Math.floor(Date.now() / 1000) - 60;

    const rejectedTokens: ReadonlyArray<[string, () => Promise<string>]> = [
        ["a non-JWT string", (): Promise<string> => Promise.resolve("not-a-jwt")],
        ["a tampered signature", async (): Promise<string> => tamper(await sign({ subject: UserFactory.createId() }))],
        ["an expired token", (): Promise<string> =>
            sign({ subject: UserFactory.createId(), expiration: expiredEpochSeconds() })],
        ["a wrong issuer", (): Promise<string> =>
            sign({ subject: UserFactory.createId(), issuer: "https://evil.test/" })],
        ["a wrong audience", (): Promise<string> =>
            sign({ subject: UserFactory.createId(), audience: "someone-else" })],
        ["an unknown signing key", (): Promise<string> =>
            sign({ subject: UserFactory.createId(), key: unknownKeyPair.privateKey })],
    ];

    test.each(rejectedTokens)("responds UNAUTHENTICATED for %s", async (_label, makeToken) => {
        await request(app.getHttpServer())
            .post("/projects")
            .set(bearer(await makeToken()))
            .send(CreateProjectBody.create())
            .expect(HttpStatus.UNAUTHORIZED);
    });
});
