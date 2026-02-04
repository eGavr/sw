import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { Logger } from "../../../infrastructure/logging/logger";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";

import { YdbClient } from "./ydb-client";
import { YdbLogger } from "./ydb-logger";

@Module({
    imports: [ConfigModule, LoggerModule],
    providers: [
        {
            provide: YdbClient,
            useFactory: async (configService: ConfigService, logger: Logger): Promise<YdbClient> => {
                logger.debug(configService.get<string>("YDB_ENDPOINT") || "");
                
                const client = new YdbClient(new YdbLogger(logger));

                await client.initialize();

                return client;
            },
            inject: [ConfigService, Logger],
        },
    ],
    exports: [YdbClient],
})
export class YdbModule {}
