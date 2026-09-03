import { Injectable } from "@nestjs/common";

import { WebDriverSessionOptions } from "../../../application/interfaces/gateways/webdriver-session-gateway";
import { netBridgeProxyPort } from "../environment-provider/net-bridge-forwarder";

type NewSessionResponse = {
    value?: {
        sessionId?: string;
    };
};

type SessionTarget = {
    name: string;
    version: string;
    platformName: string;
};

const androidPlatformName = "android";
const androidNewCommandTimeoutSeconds = 600;

// A generous single fuse for the create call, not a per-platform estimate: a live reservation is kept
// alive by heartbeats, so this only bounds a node that stopped answering (the caller then releases the
// reservation instead of holding it forever).
const newSessionTimeoutMs = 60_000;

@Injectable()
export class WebDriverClient {
    async createSession(endpoint: string, target: SessionTarget, options?: WebDriverSessionOptions): Promise<string> {
        const alwaysMatch = this.alwaysMatch(target);

        // Vendor capabilities the in-node agent reads back to decide whether to ship this session's logs /
        // record its video. W3C requires the node to preserve unknown `prefix:name` capabilities.
        if (options?.logging) {
            alwaysMatch["sw:logging"] = true;
        }

        if (options?.video) {
            alwaysMatch["sw:video"] = true;
        }

        // Route the browser through the in-container NetBridge forwarder (loopback SOCKS5) so it reaches
        // the tunnel client's network. `<-loopback>` removes Chrome's implicit localhost bypass, so the
        // user's own localhost is tunnelled too. Browser-only; Android tunnelling is a separate concern.
        if (options?.netBridge && target.platformName !== androidPlatformName) {
            alwaysMatch["goog:chromeOptions"] = {
                args: [`--proxy-server=socks5://127.0.0.1:${netBridgeProxyPort}`, "--proxy-bypass-list=<-loopback>"],
            };
        }

        const response = await fetch(`${endpoint}/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ capabilities: { alwaysMatch } }),
            signal: AbortSignal.timeout(newSessionTimeoutMs),
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

    // The node's current session id, read from /status. Same approach as the in-node agent: a recursive
    // descent over the status document (so it survives cosmetic Grid shape changes), skipping the
    // transient "reserved" placeholder a Grid slot briefly reports before the real id lands. Null when
    // the node is unreachable or holds no session.
    async fetchCurrentSession(endpoint: string): Promise<string | null> {
        try {
            const response = await fetch(`${endpoint}/status`);

            if (!response.ok) {
                return null;
            }

            return this.findSessionId(await response.json());
        } catch {
            return null;
        }
    }

    private findSessionId(node: unknown): string | null {
        if (typeof node !== "object" || node === null) {
            return null;
        }

        const record = node as Record<string, unknown>;
        const session = record.session as Record<string, unknown> | undefined;
        const sessionId = session?.sessionId;

        if (typeof sessionId === "string" && sessionId !== "reserved") {
            return sessionId;
        }

        for (const value of Object.values(record)) {
            const found = this.findSessionId(value);

            if (found) {
                return found;
            }
        }

        return null;
    }

    // Capability dialect by platform: an Android environment is driven by Appium (platformName +
    // appium:*), a browser by its browserName. The vendor sw:* opt-ins are added on top for both.
    private alwaysMatch(target: SessionTarget): Record<string, unknown> {
        if (target.platformName === androidPlatformName) {
            return {
                platformName: "Android",
                "appium:automationName": "UiAutomator2",
                "appium:newCommandTimeout": androidNewCommandTimeoutSeconds,
            };
        }

        return { browserName: target.name, webSocketUrl: true };
    }
}
