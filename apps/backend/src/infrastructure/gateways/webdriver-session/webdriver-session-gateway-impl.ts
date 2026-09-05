import { Injectable } from "@nestjs/common";

import {
    WebDriverSessionGateway,
    WebDriverSessionOptions,
} from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { ApplicationCatalog } from "../../../domain/entities/application-catalog/application-catalog";
import { Application } from "../../../domain/entities/environment/application/application";
import { SessionNotCreatedError } from "../../../domain/entities/session/error/session-not-created-error";

import { WebDriverClient } from "./webdriver-client";

@Injectable()
export class WebDriverSessionGatewayImpl extends WebDriverSessionGateway {
    constructor(
        private readonly webDriverClient: WebDriverClient,
        private readonly applicationCatalog: ApplicationCatalog,
    ) {
        super();
    }

    // Client/protocol failures are translated at this boundary (W3C wording, real cause kept) so the
    // scenario surfaces an honest "session not created" instead of a swallowed or backend-shaped error.
    async create(
        endpoint: string,
        application: Application,
        platformName: string,
        options?: WebDriverSessionOptions,
    ): Promise<string> {
        try {
            return await this.webDriverClient.createSession(
                endpoint,
                {
                    // The node speaks the wire vocabulary (`browserName: chrome`), not our canonical
                    // reverse-DNS id — the catalog translates; a custom application passes through as-is.
                    name: this.applicationCatalog.wireName(application.name),
                    version: application.version,
                    platformName,
                },
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
