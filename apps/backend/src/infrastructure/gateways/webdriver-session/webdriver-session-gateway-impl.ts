import { Injectable } from "@nestjs/common";

import {
    WebDriverSessionGateway,
    WebDriverSessionOptions,
} from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { Application } from "../../../domain/entities/environment/application/application";
import { SessionNotCreatedError } from "../../../domain/entities/session/error/session-not-created-error";

import { WebDriverClient } from "./webdriver-client";

@Injectable()
export class WebDriverSessionGatewayImpl extends WebDriverSessionGateway {
    constructor(private readonly webDriverClient: WebDriverClient) {
        super();
    }

    // Client/protocol failures are translated at this boundary (W3C wording, real cause kept) so the
    // scenario surfaces an honest "session not created" instead of a swallowed or backend-shaped error.
    async create(
        endpoint: string,
        application: Application,
        wireName: string,
        platformName: string,
        options?: WebDriverSessionOptions,
    ): Promise<string> {
        try {
            return await this.webDriverClient.createSession(
                endpoint,
                { name: wireName, version: application.version, platformName },
                options,
            );
        } catch (error) {
            throw new SessionNotCreatedError(error instanceof Error ? error.message : String(error));
        }
    }

    async fetchCurrent(endpoint: string): Promise<string | null> {
        return this.webDriverClient.fetchCurrentSession(endpoint);
    }
}
