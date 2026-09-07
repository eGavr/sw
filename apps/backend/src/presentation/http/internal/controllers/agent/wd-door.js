#!/usr/bin/env node
// The wd door of a linux node: the single WebDriver surface the control plane talks to, in front of a
// bare webdriver (chromedriver or geckodriver). It supplies what the control plane's contracts expect from a node and chromedriver
// alone does not have:
//   - a Selenium-Grid-shaped /status the heartbeat agent reads for readiness, busy and the session's
//     capabilities (the sw:logging / sw:video opt-ins);
//   - the one-session rule (a second New Session is refused) and the smart idle timeout (a session
//     with no commands for the configured time is deleted);
//   - the websocket routes the control plane proxies by session id: /se/vnc to the VNC bridge, /se/bidi
//     to chromedriver's BiDi endpoint, /se/cdp to the browser's DevTools socket;
//   - the container's own launch needs, injected into every New Session in the driver's own dialect:
//     the delivered browser binary and the flags a root-run browser requires.
// Busy is tracked by watching the proxied traffic (a successful New Session opens the slot, a DELETE or
// the idle timer closes it), never by asking chromedriver.
const http = require("http");

const port = Number(process.env.SW_DOOR_PORT || 4444);
const upstreamPort = Number(process.env.SW_DOOR_UPSTREAM_PORT || 9515);
const vncWsPort = Number(process.env.SW_DOOR_VNC_WS_PORT || 7900);
const browserBinary = process.env.SW_DOOR_BROWSER_BINARY || "";
const idleTimeoutMs = Number(process.env.SW_DOOR_IDLE_TIMEOUT_SECONDS || 300) * 1000;
const upstreamProbeIntervalMs = 2000;

// Each driver knows its browser by one word and takes its launch options under its own key. A root-run
// chrome refuses to start without --no-sandbox (the container has no user namespace to sandbox in);
// firefox runs as root as it is.
const dialects = {
    chromedriver: { browserName: "chrome", optionsKey: "goog:chromeOptions", requiredArgs: ["--no-sandbox"] },
    geckodriver: { browserName: "firefox", optionsKey: "moz:firefoxOptions", requiredArgs: [] },
};
const dialect = dialects[process.env.SW_DOOR_DRIVER] || dialects.chromedriver;

let upstreamReady = false;
let current = null; // { id, capabilities, lastCommandAt, bidiUrl, debuggerAddress }
const tunnels = new Set();

function log(...parts) {
    console.log("[wd-door]", ...parts);
}

function readBody(request) {
    return new Promise((resolve) => {
        let body = "";
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => resolve(body));
    });
}

function gridStatus() {
    const slot = current
        ? { session: { sessionId: current.id, capabilities: current.capabilities } }
        : { session: null };

    return { value: { ready: upstreamReady, message: "sw linux node", nodes: [{ slots: [slot] }] } };
}

// The effective capabilities a New Session asked for: alwaysMatch with the first firstMatch entry on top
// (one environment allocates one alternative, the way the control plane resolves the envelope).
function requestedCapabilities(payload) {
    const capabilities = payload.capabilities || {};
    const first = Array.isArray(capabilities.firstMatch) ? capabilities.firstMatch[0] : undefined;

    return { ...(capabilities.alwaysMatch || {}), ...(first || {}) };
}

// What the driver needs to hear, whatever the environment addresses its browser by: the control plane
// already matched the environment to the ask, so the browser words are not re-matched here — the
// driver knows the browser it drives by its one word, and the version it would compare is the one it
// is about to launch. The delivered binary and the required flags go into the session's options under
// the driver's key — wherever the caller put them (alwaysMatch or a firstMatch entry), so no key ends
// up defined in both.
function adaptNewSession(payload) {
    const capabilities = payload.capabilities || (payload.capabilities = {});
    const holders = [capabilities.alwaysMatch, ...(Array.isArray(capabilities.firstMatch) ? capabilities.firstMatch : [])]
        .filter((holder) => holder && typeof holder === "object");

    for (const holder of holders) {
        delete holder.browserVersion;
        if (holder.browserName !== undefined) {
            holder.browserName = dialect.browserName;
        }
    }

    const holder = holders.find((candidate) => candidate[dialect.optionsKey])
        || capabilities.alwaysMatch
        || (capabilities.alwaysMatch = {});
    const options = holder[dialect.optionsKey] || (holder[dialect.optionsKey] = {});
    const args = Array.isArray(options.args) ? options.args : [];

    options.args = [...args, ...dialect.requiredArgs.filter((flag) => !args.includes(flag))];

    if (browserBinary && !options.binary) {
        options.binary = browserBinary;
    }

    return payload;
}

function sendJson(response, status, body) {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(body));
}

function sessionNotCreated(response, message) {
    sendJson(response, 500, { value: { error: "session not created", message, stacktrace: "" } });
}

function forward(request, body, onResponse) {
    const headers = { ...request.headers, host: `127.0.0.1:${upstreamPort}` };
    delete headers["transfer-encoding"];
    if (body !== undefined) {
        headers["content-length"] = String(Buffer.byteLength(body));
    }

    const upstream = http.request(
        { host: "127.0.0.1", port: upstreamPort, path: request.url, method: request.method, headers },
        (upstreamResponse) => {
            let upstreamBody = "";
            upstreamResponse.on("data", (chunk) => (upstreamBody += chunk));
            upstreamResponse.on("end", () => onResponse(null, upstreamResponse, upstreamBody));
        },
    );

    upstream.on("error", (error) => onResponse(error));
    upstream.end(body);
}

function relay(response, upstreamResponse, upstreamBody) {
    const headers = { ...upstreamResponse.headers };
    delete headers["transfer-encoding"];
    headers["content-length"] = String(Buffer.byteLength(upstreamBody));
    response.writeHead(upstreamResponse.statusCode || 502, headers);
    response.end(upstreamBody);
}

function openSession(requested, upstreamBody) {
    let value;
    try {
        value = JSON.parse(upstreamBody).value;
    } catch {
        return;
    }
    if (!value || !value.sessionId) {
        return;
    }

    const capabilities = { ...requested, ...(value.capabilities || {}) };
    const chromeOptions = capabilities["goog:chromeOptions"] || {};

    current = {
        id: value.sessionId,
        capabilities,
        lastCommandAt: Date.now(),
        bidiUrl: typeof capabilities.webSocketUrl === "string" ? capabilities.webSocketUrl : null,
        debuggerAddress: typeof chromeOptions.debuggerAddress === "string" ? chromeOptions.debuggerAddress : null,
    };
    log("session opened", current.id);
}

function closeSession(reason) {
    if (!current) {
        return;
    }
    log("session closed", current.id, `(${reason})`);
    current = null;
    // x11vnc serves the display, not the session: a viewer must not outlive its session.
    for (const socket of tunnels) {
        socket.destroy();
    }
    tunnels.clear();
}

async function handle(request, response) {
    const path = request.url.split("?")[0];

    if (request.method === "GET" && path === "/status") {
        sendJson(response, 200, gridStatus());

        return;
    }

    const isCreate = request.method === "POST" && path === "/session";
    const sessionMatch = path.match(/^\/session\/([^/]+)(\/|$)/);
    const sessionId = sessionMatch ? sessionMatch[1] : null;

    if (isCreate && current) {
        sessionNotCreated(response, "node busy: one session per environment");

        return;
    }

    let body = await readBody(request);
    let requested = {};

    if (isCreate) {
        try {
            const payload = adaptNewSession(JSON.parse(body || "{}"));
            requested = requestedCapabilities(payload);
            body = JSON.stringify(payload);
        } catch {
            sessionNotCreated(response, "malformed New Session body");

            return;
        }
    }

    if (current && sessionId === current.id) {
        current.lastCommandAt = Date.now();
    }

    forward(request, body, (error, upstreamResponse, upstreamBody) => {
        if (error) {
            sendJson(response, 502, { value: { error: "unknown error", message: `webdriver unreachable: ${error.message}` } });

            return;
        }

        if (isCreate && upstreamResponse.statusCode === 200) {
            openSession(requested, upstreamBody);
        }

        if (request.method === "DELETE" && sessionMatch && current && sessionId === current.id) {
            closeSession("deleted");
        }

        relay(response, upstreamResponse, upstreamBody);
    });
}

// ---------------------------------------------------------------- websocket routes
function parseWsUrl(url) {
    const parsed = new URL(url);

    return { host: parsed.hostname, port: Number(parsed.port || 80), path: `${parsed.pathname}${parsed.search}` };
}

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (response) => {
            let body = "";
            response.on("data", (chunk) => (body += chunk));
            response.on("end", () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject(error);
                }
            });
        }).on("error", reject);
    });
}

async function resolveTarget(kind) {
    if (kind === "vnc") {
        return { host: "127.0.0.1", port: vncWsPort, path: "/" };
    }

    if (kind === "bidi") {
        if (!current.bidiUrl) {
            throw new Error("the session was created without webSocketUrl");
        }

        return parseWsUrl(current.bidiUrl);
    }

    if (!current.debuggerAddress) {
        throw new Error("the session exposes no DevTools address");
    }
    const version = await fetchJson(`http://${current.debuggerAddress}/json/version`);

    return parseWsUrl(version.webSocketDebuggerUrl);
}

function refuse(socket, status) {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

function tunnel(request, socket, head, target) {
    const headers = { ...request.headers, host: `${target.host}:${target.port}` };
    const upstream = http.request({ host: target.host, port: target.port, path: target.path, method: "GET", headers });

    upstream.on("upgrade", (upstreamResponse, upstreamSocket, upstreamHead) => {
        const lines = [
            `HTTP/1.1 ${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}`,
            ...Object.entries(upstreamResponse.headers).map(([name, value]) => `${name}: ${[].concat(value).join(", ")}`),
            "",
            "",
        ];
        socket.write(lines.join("\r\n"));
        if (upstreamHead && upstreamHead.length) {
            socket.write(upstreamHead);
        }
        if (head && head.length) {
            upstreamSocket.write(head);
        }
        socket.pipe(upstreamSocket).pipe(socket);
        tunnels.add(socket);
        const drop = () => {
            tunnels.delete(socket);
            socket.destroy();
            upstreamSocket.destroy();
        };
        socket.on("error", drop);
        socket.on("close", drop);
        upstreamSocket.on("error", drop);
        upstreamSocket.on("close", drop);
    });
    upstream.on("response", (upstreamResponse) => refuse(socket, `${upstreamResponse.statusCode} ${upstreamResponse.statusMessage}`));
    upstream.on("error", () => refuse(socket, "502 Bad Gateway"));
    upstream.end();
}

const server = http.createServer((request, response) => {
    handle(request, response).catch((error) => {
        log("request failed", error.message);
        sendJson(response, 500, { value: { error: "unknown error", message: error.message } });
    });
});

server.on("upgrade", (request, socket, head) => {
    const match = request.url.split("?")[0].match(/^\/session\/([^/]+)\/se\/(vnc|bidi|cdp)$/);

    if (!match || !current || match[1] !== current.id) {
        refuse(socket, "404 Not Found");

        return;
    }

    resolveTarget(match[2])
        .then((target) => tunnel(request, socket, head, target))
        .catch((error) => {
            log(`${match[2]} route unavailable:`, error.message);
            refuse(socket, "502 Bad Gateway");
        });
});

setInterval(() => {
    if (current && Date.now() - current.lastCommandAt > idleTimeoutMs) {
        const idle = current.id;
        closeSession("idle timeout");
        http.request({ host: "127.0.0.1", port: upstreamPort, path: `/session/${idle}`, method: "DELETE" })
            .on("error", () => undefined)
            .end();
    }
}, 1000).unref();

setInterval(() => {
    http.get({ host: "127.0.0.1", port: upstreamPort, path: "/status" }, (response) => {
        upstreamReady = response.statusCode === 200;
        response.resume();
    }).on("error", () => {
        upstreamReady = false;
    });
}, upstreamProbeIntervalMs).unref();

server.listen(port, "0.0.0.0", () => log(`listening on :${port} -> ${dialect.browserName}'s driver :${upstreamPort}`));
