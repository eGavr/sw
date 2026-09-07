import { ChildProcess, spawn } from "node:child_process";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { AddressInfo } from "node:net";
import { join } from "node:path";

import { WebSocket, WebSocketServer } from "ws";

// The wd door is what turns a bare chromedriver into the node the control plane expects. It is exercised
// here blackbox: a real door process (the file the control plane serves) in front of a stub chromedriver
// and a stub VNC bridge — the only two external things the door talks to.
const doorFile = join(__dirname, "../../../../../../../src/presentation/http/internal/controllers/agent/wd-door.js");

type StubSession = { id: string; capabilities: Record<string, unknown> };
type CreatedSession = { value: { sessionId: string } };

const listen = (server: Server): Promise<number> => new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port));
});

const readJson = (request: IncomingMessage): Promise<Record<string, unknown>> => new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body ? JSON.parse(body) as Record<string, unknown> : {}));
});

const send = (response: ServerResponse, status: number, body: unknown): void => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
};

describe("wd door (linux node)", () => {
    let chromedriver: Server;
    let chromedriverPort: number;
    let vnc: Server;
    let vncSocket: WebSocketServer;
    let door: ChildProcess;
    let doorPort: number;
    let sessions: Array<StubSession>;
    let createRequests: Array<Record<string, unknown>>;
    let deleted: Array<string>;

    beforeEach(async () => {
        sessions = [];
        createRequests = [];
        deleted = [];

        // A minimal chromedriver: /status, New Session (echoing the caps and a BiDi url), delete.
        chromedriver = createServer(async (request, response) => {
            const path = (request.url ?? "").split("?")[0];

            if (request.method === "GET" && path === "/status") {
                send(response, 200, { value: { ready: true, message: "stub" } });
            } else if (request.method === "POST" && path === "/session") {
                const payload = await readJson(request);
                createRequests.push(payload);
                const id = `wd-${sessions.length + 1}`;
                const capabilities = {
                    browserName: "chrome",
                    browserVersion: "152.0.7977.82",
                    webSocketUrl: `ws://127.0.0.1:${chromedriverPort}/session/${id}`,
                };
                sessions.push({ id, capabilities });
                send(response, 200, { value: { sessionId: id, capabilities } });
            } else if (request.method === "DELETE" && /^\/session\/[^/]+$/.test(path)) {
                deleted.push(path.split("/")[2]);
                send(response, 200, { value: null });
            } else if (/^\/session\/[^/]+\/url$/.test(path)) {
                send(response, 200, { value: null });
            } else {
                send(response, 404, { value: { error: "unknown command", message: path } });
            }
        });
        chromedriverPort = await listen(chromedriver);
        // chromedriver's BiDi endpoint: a websocket on the session path.
        const bidi = new WebSocketServer({ server: chromedriver });
        bidi.on("connection", (socket, request) => socket.send(`bidi:${request.url}`));

        vnc = createServer();
        vncSocket = new WebSocketServer({ server: vnc });
        vncSocket.on("connection", (socket) => socket.send("rfb"));
        const vncPort = await listen(vnc);

        const free = createServer();
        doorPort = await listen(free);
        await new Promise<void>((resolve) => free.close(() => resolve()));

        door = spawn("node", [doorFile], {
            env: {
                ...process.env,
                SW_DOOR_PORT: String(doorPort),
                SW_DOOR_UPSTREAM_PORT: String(chromedriverPort),
                SW_DOOR_VNC_WS_PORT: String(vncPort),
                SW_DOOR_BROWSER_BINARY: "/opt/sw/apps/chrome/chrome-linux64/chrome",
                SW_DOOR_IDLE_TIMEOUT_SECONDS: "1",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        await waitFor(async () => (await status()).value.ready === true);
    });

    afterEach(async () => {
        door.kill();
        await new Promise<void>((resolve) => chromedriver.close(() => resolve()));
        await new Promise<void>((resolve) => vnc.close(() => resolve()));
    });

    const waitFor = async (probe: () => Promise<boolean>): Promise<void> => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            try {
                if (await probe()) {
                    return;
                }
            } catch {
                // not yet
            }
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error("condition not met in time");
    };

    type NodeSession = null | { sessionId: string; capabilities: Record<string, unknown> };
    type GridStatus = { value: { ready: boolean; nodes: Array<{ slots: Array<{ session: NodeSession }> }> } };

    const status = async (): Promise<GridStatus> =>
        (await fetch(`http://127.0.0.1:${doorPort}/status`)).json() as never;

    const currentSession = async (): Promise<NodeSession> => (await status()).value.nodes[0].slots[0].session;

    const createSession = (alwaysMatch: Record<string, unknown>): Promise<Response> =>
        fetch(`http://127.0.0.1:${doorPort}/session`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ capabilities: { alwaysMatch } }),
        });

    const wsMessage = (path: string): Promise<string> => new Promise((resolve, reject) => {
        const socket = new WebSocket(`ws://127.0.0.1:${doorPort}${path}`);
        socket.on("message", (data) => {
            socket.close();
            resolve(data.toString());
        });
        socket.on("error", reject);
        socket.on("unexpected-response", (_, response) => reject(new Error(`ws refused: ${response.statusCode}`)));
    });

    test("reports the Grid-shaped status the heartbeat agent reads: free, then the session with its capabilities", async () => {
        expect(await currentSession()).toBeNull();

        const response = await createSession({ browserName: "chrome", "sw:logging": true, "sw:video": false });
        expect(response.status).toBe(200);
        const body = await response.json() as CreatedSession;

        expect(await currentSession()).toEqual({
            sessionId: body.value.sessionId,
            capabilities: expect.objectContaining({
                browserName: "chrome",
                browserVersion: "152.0.7977.82",
                "sw:logging": true,
                "sw:video": false,
            }),
        });
    });

    // chromedriver's own vocabulary: the browser is `chrome` whatever word the environment used, the
    // version is not re-matched (the control plane already matched the environment), the delivered
    // binary and the root-run flags ride in chromeOptions.
    test("adapts every New Session to chromedriver", async () => {
        await createSession({
            browserName: "chromium",
            browserVersion: "140.0.7339.16",
            "goog:chromeOptions": { args: ["--headless=new"] },
        });

        const [payload] = createRequests;
        const alwaysMatch = (payload.capabilities as { alwaysMatch: Record<string, unknown> }).alwaysMatch;
        const options = alwaysMatch["goog:chromeOptions"] as Record<string, unknown>;
        expect(alwaysMatch.browserName).toBe("chrome");
        expect(alwaysMatch.browserVersion).toBeUndefined();
        expect(options.binary).toBe("/opt/sw/apps/chrome/chrome-linux64/chrome");
        expect(options.args).toEqual(["--headless=new", "--no-sandbox"]);
    });

    test("holds one session: a second New Session is refused as session-not-created", async () => {
        await createSession({ browserName: "chrome" });

        const second = await createSession({ browserName: "chrome" });

        expect(second.status).toBe(500);
        expect(await second.json()).toMatchObject({ value: { error: "session not created" } });
        expect(sessions).toHaveLength(1);
    });

    test("frees the slot on delete and proxies commands to chromedriver", async () => {
        const created = await (await createSession({ browserName: "chrome" })).json() as CreatedSession;
        const id = created.value.sessionId;

        const command = await fetch(`http://127.0.0.1:${doorPort}/session/${id}/url`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ url: "https://example.org" }),
        });
        expect(command.status).toBe(200);

        await fetch(`http://127.0.0.1:${doorPort}/session/${id}`, { method: "DELETE" });

        expect(deleted).toEqual([id]);
        expect(await currentSession()).toBeNull();
    });

    test("deletes a session that stays idle past the timeout", async () => {
        const created = await (await createSession({ browserName: "chrome" })).json() as CreatedSession;

        await waitFor(async () => deleted.includes(created.value.sessionId));

        expect(await currentSession()).toBeNull();
    });

    test("routes the session's websocket protocols: VNC to the bridge, BiDi to chromedriver", async () => {
        const created = await (await createSession({ browserName: "chrome", webSocketUrl: true })).json() as CreatedSession;
        const id = created.value.sessionId;

        expect(await wsMessage(`/session/${id}/se/vnc`)).toBe("rfb");
        expect(await wsMessage(`/session/${id}/se/bidi`)).toBe(`bidi:/session/${id}`);
        await expect(wsMessage("/session/someone-else/se/vnc")).rejects.toThrow(/404/);
    });
});
