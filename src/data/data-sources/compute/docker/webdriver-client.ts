import { Injectable } from "@nestjs/common";

type NewSessionResponse = {
    value?: {
        sessionId?: string;
    };
};

@Injectable()
export class WebDriverClient {
    async createSession(endpoint: string, browserName: string): Promise<string> {
        const response = await fetch(`${endpoint}/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ capabilities: { alwaysMatch: { browserName } } }),
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
