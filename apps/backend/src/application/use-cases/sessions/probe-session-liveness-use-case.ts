import { Injectable } from "@nestjs/common";

import { WebDriverSessionGateway } from "../../interfaces/gateways/webdriver-session-gateway";

export type ProbeSessionLivenessParams = {
    readonly endpoint: string;
    readonly webDriverSessionId: string;
};

// Whether the session still lives, asked of the NODE's status — never of the session itself: a
// session command would count as the user's traffic and reset the node's idle timeout (a watcher
// would keep an abandoned session alive forever). Reading /status touches nothing.
@Injectable()
export class ProbeSessionLivenessUseCase {
    constructor(private readonly webDriverSessionGateway: WebDriverSessionGateway) {}

    async execute({ endpoint, webDriverSessionId }: ProbeSessionLivenessParams): Promise<boolean> {
        return (await this.webDriverSessionGateway.fetchCurrent(endpoint)) === webDriverSessionId;
    }
}
