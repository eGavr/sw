import { createServer, Server } from "node:http";
import { AddressInfo } from "node:net";

import { WebDriverClient } from "../../../../../../../src/infrastructure/gateways/webdriver-session/webdriver-client";

// WebDriverClient is the wrapper around the external browser node, so it is exercised against a fake node
// http server (the sanctioned "fake the final external client" pattern) to assert what goes on the wire.
describe("WebDriverClient", () => {
    let node: Server;
    let endpoint: string;
    let lastBody: string;

    beforeAll(async () => {
        node = createServer((req, res) => {
            let body = "";
            req.setEncoding("utf8");
            req.on("data", (chunk: string) => { body += chunk; });
            req.on("end", () => {
                lastBody = body;
                res.writeHead(200, { "content-type": "application/json" });
                res.end(JSON.stringify({ value: { sessionId: "wd-1" } }));
            });
        });

        await new Promise<void>((resolve) => node.listen(0, "127.0.0.1", resolve));
        endpoint = `http://127.0.0.1:${(node.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => node.close(() => resolve()));
    });

    const alwaysMatch = (): Record<string, unknown> =>
        (JSON.parse(lastBody) as { capabilities: { alwaysMatch: Record<string, unknown> } }).capabilities.alwaysMatch;

    const chrome = { name: "chrome", version: "latest", platformName: "linux" };
    const android = { name: "com.android.settings", version: "11", platformName: "android" };

    test("adds the sw:logging capability when logging is opted in", async () => {
        await new WebDriverClient().createSession(endpoint, chrome, { logging: true });

        expect(alwaysMatch()["sw:logging"]).toBe(true);
        expect(alwaysMatch().browserName).toBe("chrome");
    });

    test("omits the sw:logging capability by default", async () => {
        await new WebDriverClient().createSession(endpoint, chrome);

        expect(alwaysMatch()).not.toHaveProperty("sw:logging");
    });

    test("adds the sw:video capability when video is opted in", async () => {
        await new WebDriverClient().createSession(endpoint, chrome, { video: true });

        expect(alwaysMatch()["sw:video"]).toBe(true);
        expect(alwaysMatch().browserName).toBe("chrome");
    });

    test("omits the sw:video capability by default", async () => {
        await new WebDriverClient().createSession(endpoint, chrome);

        expect(alwaysMatch()).not.toHaveProperty("sw:video");
    });

    test("uses Appium capabilities for an Android platform", async () => {
        await new WebDriverClient().createSession(endpoint, android, { video: true });

        expect(alwaysMatch().platformName).toBe("Android");
        expect(alwaysMatch()["appium:automationName"]).toBe("UiAutomator2");
        expect(alwaysMatch()).not.toHaveProperty("browserName");
        expect(alwaysMatch()["sw:video"]).toBe(true);
    });
});
