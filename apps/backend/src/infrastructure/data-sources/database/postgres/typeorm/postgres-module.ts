import { Module, OnApplicationShutdown } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";

import { Logger } from "../../../../../infrastructure/logging/logger";
import { LoggerModule } from "../../../../../infrastructure/logging/logger-module";

import { PostgresConnection } from "./postgres-connection";

@Module({
    imports: [ConfigModule, LoggerModule],
    providers: [
        {
            provide: DataSource,
            useFactory: async (configService: ConfigService, logger: Logger): Promise<DataSource> => {
                const connection = PostgresConnection.create(configService);

                await connection.initialize();

                // An idle pooled connection can die on its own (the database restarts, a proxy drops
                // it, credentials blink). Postgres reports that on the pool, and an unheard `error`
                // event ends the process — so it is heard, logged and left to the pool, which discards
                // the broken client and opens a fresh one for the next query.
                (connection.driver as { master?: { on?: (event: string, handler: (error: Error) => void) => void } })
                    .master?.on?.("error", (error: Error) => logger.error(`postgres pool: ${error.message}`));

                return connection;
            },
            inject: [ConfigService, Logger],
        },
    ],
    exports: [DataSource],
})
export class PostgresModule implements OnApplicationShutdown {
    constructor(private dataSource: DataSource) {}

    async onApplicationShutdown(): Promise<void> {
        if (this.dataSource.isInitialized) {
            await this.dataSource.destroy();
        }
    }
}
