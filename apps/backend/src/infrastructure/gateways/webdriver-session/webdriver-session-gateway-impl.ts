import { Injectable } from "@nestjs/common";

import {
    WebDriverSessionGateway,
    WebDriverSessionOptions,
} from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { Application } from "../../../domain/entities/environment/application/application";

import { WebDriverClient } from "./webdriver-client";

@Injectable()
export class WebDriverSessionGatewayImpl extends WebDriverSessionGateway {
    constructor(private readonly webDriverClient: WebDriverClient) {
        super();
    }

    async create(
        endpoint: string,
        application: Application,
        platformName: string,
        options?: WebDriverSessionOptions,
    ): Promise<string> {
        return this.webDriverClient.createSession(
            endpoint,
            { name: application.name, version: application.version, platformName },
            options,
        );
    }
}
