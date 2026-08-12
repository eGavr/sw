import { Injectable } from "@nestjs/common";

export type ProxyRequest = {
    method: string;
    path: string;
    headers: Record<string, string | undefined>;
    body?: string;
};

export type ProxyResponse = {
    status: number;
    headers: Record<string, string>;
    body: string;
};

// Transport-level reverse proxy: forwards a WebDriver command to the target container endpoint.
// It moves bytes only; no business logic lives here.
@Injectable()
export class WebDriverProxy {
    async forward(endpoint: string, webDriverSessionId: string, request: ProxyRequest): Promise<ProxyResponse> {
        const suffix = request.path ? `/${request.path}` : "";
        const hasBody = request.method !== "GET" && request.method !== "DELETE" && request.method !== "HEAD";

        const response = await fetch(`${endpoint}/session/${webDriverSessionId}${suffix}`, {
            method: request.method,
            headers: { "content-type": request.headers["content-type"] ?? "application/json" },
            body: hasBody ? (request.body ?? "") : undefined,
        });

        return {
            status: response.status,
            headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
            body: await response.text(),
        };
    }
}
