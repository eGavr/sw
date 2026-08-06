import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "pg";

import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../../application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../../application/use-cases/environments/prepare-next-environment-use-case";

const channel = "environment_work";

// Presentation runtime of the worker: holds a raw pg LISTEN connection (the doorbell) and, on each
// wakeup, drives the use cases. It does no SQL/locks itself — that lives in the data source; the
// notification is just a dumb broadcast, so N workers can all wake and the atomic claim de-dupes them.
@Injectable()
export class EnvironmentWorker implements OnApplicationBootstrap, OnApplicationShutdown {
    private client: Client | null = null;
    private pumping = false;
    private pending = false;

    constructor(
        private readonly configService: ConfigService,
        private readonly prepareNextEnvironment: PrepareNextEnvironmentUseCase,
        private readonly deprovisionDeletingEnvironments: DeprovisionDeletingEnvironmentsUseCase,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        this.client = new Client({
            host: this.configService.getOrThrow("POSTGRES_HOST"),
            port: Number(this.configService.getOrThrow("POSTGRES_PORT")),
            user: this.configService.getOrThrow("POSTGRES_USER"),
            password: this.configService.getOrThrow("POSTGRES_PASSWORD"),
            database: this.configService.getOrThrow("POSTGRES_DATABASE"),
        });

        await this.client.connect();
        this.client.on("notification", () => void this.pump());
        await this.client.query(`LISTEN ${channel}`);

        // NOTIFY is not durable: catch up on whatever is already waiting.
        await this.pump();
    }

    async onApplicationShutdown(): Promise<void> {
        await this.client?.end();
        this.client = null;
    }

    // Coalesced drain: overlapping wakeups fold into a single re-run so two pumps never run at once.
    private async pump(): Promise<void> {
        if (this.pumping) {
            this.pending = true;

            return;
        }

        this.pumping = true;

        try {
            do {
                this.pending = false;
                await this.drainEnqueued();
                await this.deprovisionDeletingEnvironments.execute();
            } while (this.pending);
        } finally {
            this.pumping = false;
        }
    }

    private async drainEnqueued(): Promise<void> {
        let prepared = await this.prepareNextEnvironment.execute();

        while (prepared !== null) {
            prepared = await this.prepareNextEnvironment.execute();
        }
    }
}
