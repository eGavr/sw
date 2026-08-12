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
            useFactory: async (configService: ConfigService): Promise<DataSource> => {
                const connection = PostgresConnection.create(configService);

                await connection.initialize();

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
