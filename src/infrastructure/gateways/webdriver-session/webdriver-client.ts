import { Injectable } from "@nestjs/common";

import { WebDriverSessionOptions } from "../../../application/interfaces/gateways/webdriver-session-gateway";

type NewSessionResponse = {
    value?: {
        sessionId?: string;
    };
};

@Injectable()
export class WebDriverClient {
    async createSession(endpoint: string, browserName: string, options?: WebDriverSessionOptions): Promise<string> {
        const alwaysMatch: Record<string, unknown> = { browserName, webSocketUrl: true };

        // Vendor capability the in-pod agent reads back from the node to decide whether to ship this
        // session's logs. W3C requires the node to preserve unknown `prefix:name` capabilities.
        if (options?.logging) {
            alwaysMatch["sw:logging"] = true;
        }

        const response = await fetch(`${endpoint}/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ capabilities: { alwaysMatch } }),
        });

        if (!response.ok) {
            throw new Error(`webdriver new session failed with status ${response.status}`);
        }

        const body = await response.json() as NewSessionResponse;
        const sessionId = body.value?.sessionId;

        if (!sessionId) {
            throw new Error("webdriver new session response has no sessionId");
        }

        return sessionId;
    }

    async deleteSession(endpoint: string, webDriverSessionId: string): Promise<void> {
        await fetch(`${endpoint}/session/${webDriverSessionId}`, { method: "DELETE" });
    }
}
