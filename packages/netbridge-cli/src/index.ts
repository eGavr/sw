#!/usr/bin/env node
import net from "node:net";

import { RawData, WebSocket } from "ws";

import { EgressPolicy } from "./egress-policy";
import { Dial, ExitConnection, TunnelClient } from "./tunnel-client";

const clientPath = "/netbridge/client";
const reconnectDelayMs = 2000;

type Options = {
    url: string;
    key: string;
    allow: Array<string>;
};

function main(): void {
    const options = parseOptions(process.argv.slice(2), process.env);

    if (!options.url || !options.key) {
        process.stderr.write(
            "usage: sw-netbridge --url <wd ws base> --key <swnb_...> [--allow host1,host2]\n"
            + "  (or set SW_NETBRIDGE_URL / SW_NETBRIDGE_KEY / SW_NETBRIDGE_ALLOW)\n",
        );
        process.exit(1);
    }

    const policy = new EgressPolicy({ allow: options.allow });
    const dial = nodeDialer();

    connect(options, dial, (host) => policy.allows(host));
}

function connect(options: Options, dial: Dial, allows: (host: string) => boolean): void {
    const socket = new WebSocket(`${options.url}${clientPath}`, {
        headers: { authorization: `Bearer ${options.key}` },
    });
    const client = new TunnelClient(
        (message) => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(message);
            }
        },
        dial,
        allows,
    );

    socket.on("open", () => log(`connected to ${options.url} — remote browsers now reach this machine's network`));
    socket.on("message", (data) => client.handle(toBuffer(data)));
    socket.on("error", (error) => log(`error: ${error.message}`));
    socket.on("close", () => {
        client.closeAll();
        log(`disconnected; reconnecting in ${reconnectDelayMs}ms`);
        setTimeout(() => connect(options, dial, allows), reconnectDelayMs);
    });
}

// Dials a target on this machine's network and adapts the socket to the ExitConnection the mux drives.
function nodeDialer(): Dial {
    return (host, port) => new Promise((resolve, reject) => {
        const socket = net.connect({ host, port });
        let settled = false;

        socket.on("error", (error) => {
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        socket.once("connect", () => {
            settled = true;
            resolve(adapt(socket));
        });
    });
}

function adapt(socket: net.Socket): ExitConnection {
    return {
        write: (data): void => {
            socket.write(data);
        },
        end: (): void => {
            socket.end();
        },
        destroy: (): void => {
            socket.destroy();
        },
        onData: (handler): void => {
            socket.on("data", handler);
        },
        onClose: (handler): void => {
            socket.on("close", handler);
        },
    };
}

function parseOptions(argv: Array<string>, env: NodeJS.ProcessEnv): Options {
    const flags = new Map<string, string>();

    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];

        if (flag.startsWith("--")) {
            flags.set(flag.slice(2), argv[index + 1] ?? "");
            index += 1;
        }
    }

    const allow = flags.get("allow") ?? env.SW_NETBRIDGE_ALLOW ?? "";

    return {
        url: flags.get("url") ?? env.SW_NETBRIDGE_URL ?? "",
        key: flags.get("key") ?? env.SW_NETBRIDGE_KEY ?? "",
        allow: allow ? allow.split(",").map((host) => host.trim()).filter(Boolean) : [],
    };
}

function toBuffer(data: RawData): Buffer {
    if (Array.isArray(data)) {
        return Buffer.concat(data);
    }

    return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

function log(message: string): void {
    process.stdout.write(`[sw-netbridge] ${message}\n`);
}

main();
