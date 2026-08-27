import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { Logger } from "./logger"

@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: Logger,
            useFactory: (configService: ConfigService): Logger => {
                const logLevels = configService.getOrThrow("LOG_LEVEL").split(",");

                return new Logger({ logLevels });
            },
            inject: [ConfigService],
        },
    ],
    exports: [Logger],
})
export class LoggerModule {}
