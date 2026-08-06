import { Injectable } from "@nestjs/common";

import { EnvironmentNotFoundError } from "../../../../domain/entities/environment/error/environment-not-found-error";
import { InternalError } from "../../../../domain/entities/error/internal-error";
import { SessionData } from "../../../../domain/entities/session/session";
import { SessionDataSource } from "../session-data-source";

import { DockerEnvironmentDataSource } from "./environment-data-source";
import { WebDriverClient } from "./webdriver-client";

// Docker sessions are stateless: a session is created against the environment container's
// WebDriver endpoint, and its client-facing id encodes that endpoint (see the wd SessionRoute),
// so subsequent commands and deletion are routed by the transport proxy without a lookup.
// Concurrency ("one active session per environment") is enforced by the browser node itself.
@Injectable()
export class DockerSessionDataSource extends SessionDataSource {
    constructor(
        private readonly environmentDataSource: DockerEnvironmentDataSource,
        private readonly webDriver: WebDriverClient,
    ) {
        super();
    }

    async create(session: SessionData): Promise<SessionData> {
        const endpoint = await this.resolveEndpoint(session.environmentId);

        let webDriverSessionId: string;

        try {
            webDriverSessionId = await this.webDriver.createSession(endpoint, session.application.name);
        } catch (error) {
            throw new InternalError(`docker session: ${session.environmentId}: ${(error as Error).message}`);
        }

        return { ...session, endpoint, webDriverSessionId };
    }

    // Docker sessions are addressed by the routable id via the transport proxy; there is no
    // server-side registry to read/mutate here. FIXME: expose live sessions via the node status API.
    async get(): Promise<SessionData | null> {
        return null;
    }

    async listByEnvironment(): Promise<Array<SessionData>> {
        return [];
    }

    async delete(): Promise<void> {
        return;
    }

    private async resolveEndpoint(environmentId: string): Promise<string> {
        const environment = await this.environmentDataSource.get(environmentId);

        if (!environment?.endpoint) {
            throw new EnvironmentNotFoundError(environmentId);
        }

        return environment.endpoint;
    }
}
