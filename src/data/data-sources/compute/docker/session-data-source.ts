import { Injectable } from "@nestjs/common";

import { EnvironmentNotFoundError } from "../../../../domain/entities/environment/error/environment-not-found-error";
import { InternalError } from "../../../../domain/entities/error/internal-error";
import { SessionData } from "../../../../domain/entities/session/session";
import { SessionDataSource } from "../session-data-source";

import { DockerEnvironmentDataSource } from "./environment-data-source";
import { WebDriverClient } from "./webdriver-client";

// Docker session lifecycle: created against the environment container's WebDriver endpoint.
// Session bookkeeping lives in the wd process (its single owner); the underlying browser
// session lives in the container. Endpoint is resolved via the docker environment data source.
@Injectable()
export class DockerSessionDataSource extends SessionDataSource {
    private readonly sessions = new Map<string, SessionData>();

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

        const stored: SessionData = { ...session, webDriverSessionId };

        this.sessions.set(stored.id, stored);

        return stored;
    }

    async get(id: string): Promise<SessionData | null> {
        return this.sessions.get(id) ?? null;
    }

    async listByEnvironment(environmentId: string): Promise<Array<SessionData>> {
        return [...this.sessions.values()].filter((session) => session.environmentId === environmentId);
    }

    async delete(id: string): Promise<void> {
        const session = this.sessions.get(id);

        if (!session) {
            return;
        }

        this.sessions.delete(id);

        if (session.webDriverSessionId) {
            const endpoint = await this.resolveEndpoint(session.environmentId);

            await this.webDriver.deleteSession(endpoint, session.webDriverSessionId);
        }
    }

    private async resolveEndpoint(environmentId: string): Promise<string> {
        const environment = await this.environmentDataSource.get(environmentId);

        if (!environment?.endpoint) {
            throw new EnvironmentNotFoundError(environmentId);
        }

        return environment.endpoint;
    }
}
