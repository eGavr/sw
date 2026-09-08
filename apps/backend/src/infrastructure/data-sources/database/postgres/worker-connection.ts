import { ConfigService } from "@nestjs/config";
import { Client, QueryResult, QueryResultRow } from "pg";

// How long to wait before dialing the database again, growing with each failed attempt up to a
// ceiling: a blink is retried at once, an outage is not hammered.
export const firstReconnectDelayMs = 500;
export const maxReconnectDelayMs = 30_000;

export function reconnectDelayMs(attempt: number): number {
    return Math.min(maxReconnectDelayMs, firstReconnectDelayMs * 2 ** Math.max(0, attempt - 1));
}

// The worker's own database session: one dedicated connection (a pooled one would not do) holding the
// two things that live in a session — the LISTEN that rings on every NOTIFY, and the advisory locks the
// periodic sweeps take, where lock and unlock must meet on the same connection. It owns its survival: a
// dropped or refused connection is retried with a growing delay instead of taking the process down, and
// every (re)connection ends with a ring, since NOTIFY is not durable and whatever arrived while we were
// away must still be picked up.
export class WorkerConnection {
    private client: Client | null = null;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private attempt = 0;
    private stopped = false;

    constructor(
        private readonly configService: ConfigService,
        private readonly onError: (message: string) => void,
    ) {}

    async listen(channel: string, ring: () => void): Promise<void> {
        this.stopped = false;
        await this.open(channel, ring);
    }

    // A query on the session itself — for the session-scoped state the worker keeps here (advisory
    // locks). Null while the session is down: the caller simply skips this round.
    async query<T extends QueryResultRow>(sql: string, params?: Array<unknown>): Promise<QueryResult<T> | null> {
        const client = this.client;

        if (!client) {
            return null;
        }

        return client.query<T>(sql, params);
    }

    async stop(): Promise<void> {
        this.stopped = true;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        const client = this.client;
        this.client = null;
        await client?.end().catch(() => undefined);
    }

    private async open(channel: string, ring: () => void): Promise<void> {
        try {
            const client = new Client({
                host: this.configService.getOrThrow("POSTGRES_HOST"),
                port: Number(this.configService.getOrThrow("POSTGRES_PORT")),
                user: this.configService.getOrThrow("POSTGRES_USER"),
                password: this.configService.getOrThrow("POSTGRES_PASSWORD"),
                database: this.configService.getOrThrow("POSTGRES_DATABASE"),
            });

            // Without this listener a connection error is an unhandled event — it would end the
            // process, which is how a momentary database blink used to kill the worker.
            client.on("error", (error: Error) => {
                this.onError(`worker: database session lost: ${error.message}`);
                this.scheduleReopen(channel, ring);
            });
            client.on("notification", ring);

            await client.connect();
            await client.query(`LISTEN ${channel}`);

            this.client = client;
            this.attempt = 0;

            ring();
        } catch (error) {
            this.onError(`worker: database session could not connect: ${(error as Error).message}`);
            this.scheduleReopen(channel, ring);
        }
    }

    private scheduleReopen(channel: string, ring: () => void): void {
        if (this.stopped || this.reconnectTimer) {
            return;
        }

        const client = this.client;
        this.client = null;
        void client?.end().catch(() => undefined);

        this.attempt += 1;
        // Deliberately NOT unref'd: while the session is down there is no socket left to keep the
        // process alive, and an unref'd timer would let node decide the worker has nothing to do and
        // exit — a database blink would end the worker just as surely as a crash.
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.open(channel, ring);
        }, reconnectDelayMs(this.attempt));
    }
}
