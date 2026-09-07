import { INestApplication } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";

import {
    AgentTokenServiceProvider,
} from "../../../../../../../src/infrastructure/agent-token/agent-token-service-provider";
import { LoggerModule } from "../../../../../../../src/infrastructure/logging/logger-module";
import { AipExceptionFilter } from "../../../../../../../src/presentation/http/filters/aip-exception-filter";
import {
    InternalAgentController,
} from "../../../../../../../src/presentation/http/internal/controllers/agent/agent-controller";
import {
    InternalAgentTokenGuard,
} from "../../../../../../../src/presentation/http/internal/guards/internal-agent-token-guard";
import { internalAgentToken } from "../../../utils/request/internal-agent-token";

// The assets a node fetches from the control plane at start, so nothing is baked into an image: the
// heartbeat agent, the linux node script and the wd door. Served to a holder of a per-environment
// agent token, as text the node can run as is.
describe("GET /internal/{asset}:download", () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`] }),
                LoggerModule,
            ],
            controllers: [InternalAgentController],
            providers: [
                AgentTokenServiceProvider,
                { provide: APP_GUARD, useClass: InternalAgentTokenGuard },
                { provide: APP_FILTER, useClass: AipExceptionFilter },
            ],
        }).compile();

        app = moduleRef.createNestApplication();
        await app.init();
    });

    afterEach(async () => {
        await app.close();
    });

    const download = (asset: string): request.Test =>
        request(app.getHttpServer())
            .get(`/internal/${asset}:download`)
            .set("authorization", `Bearer ${internalAgentToken(uuidv4())}`);

    test("serves the heartbeat agent as a shell script", async () => {
        const { text, type } = await download("agentScript").expect(200);

        expect(type).toBe("text/x-shellscript");
        expect(text).toContain(":heartbeat");
    });

    test("serves the linux node script, which fetches the wd door and delivers the applications", async () => {
        const { text, type } = await download("linuxNode").expect(200);

        expect(type).toBe("text/x-shellscript");
        expect(text).toContain("wdDoor:download");
        expect(text).toContain(":downloadApp");
        expect(text).toContain(":downloadWebdriver");
    });

    test("serves the wd door as javascript", async () => {
        const { text, type } = await download("wdDoor").expect(200);

        expect(type).toBe("text/javascript");
        expect(text).toContain("/status");
    });

    test("responds NOT_FOUND for an unknown asset", () => {
        return download("somethingElse").expect(404);
    });

    test("responds UNAUTHENTICATED without an agent token", () => {
        return request(app.getHttpServer()).get("/internal/linuxNode:download").expect(401);
    });
});
