import { Injectable } from "@nestjs/common";

import { WebDriverSessionGateway } from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { Application } from "../../../domain/entities/environment/application/application";

import { WebDriverClient } from "./webdriver-client";

@Injectable()
export class WebDriverSessionGatewayImpl extends WebDriverSessionGateway {
    constructor(private readonly webDriverClient: WebDriverClient) {
        super();
    }

    async create(endpoint: string, application: Application): Promise<string> {
        return this.webDriverClient.createSession(endpoint, application.name);
    }
}
