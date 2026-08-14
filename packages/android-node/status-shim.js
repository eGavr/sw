// Presents the Android node as a Selenium-Grid-shaped /status so the stock heartbeat agent works
// unchanged: it reads .value.ready and counts .session objects (busy) with their capabilities. Appium's
// own /sessions is reshaped into the single-slot grid document the agent recurses over.
const http = require("http");

const APPIUM = "http://127.0.0.1:4723";
const PORT = 4445;

function fetchSessions() {
    return new Promise((resolve) => {
        http.get(`${APPIUM}/sessions`, (response) => {
            let body = "";
            response.on("data", (chunk) => (body += chunk));
            response.on("end", () => {
                try {
                    resolve(JSON.parse(body).value || []);
                } catch {
                    resolve([]);
                }
            });
        }).on("error", () => resolve([]));
    });
}

http.createServer(async (request, response) => {
    if (request.url.split("?")[0] !== "/status") {
        response.writeHead(404).end();

        return;
    }

    const sessions = await fetchSessions();
    const slot = sessions.length
        ? { session: { sessionId: sessions[0].id, capabilities: sessions[0].capabilities || {} } }
        : { session: null };

    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ value: { ready: true, message: "android node", nodes: [{ slots: [slot] }] } }));
}).listen(PORT, "127.0.0.1");
