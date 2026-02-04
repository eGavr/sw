import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { SessionDataSource } from "../../../../../data/data-sources/ydb/session-data-source";
import { YdbModule } from "../../../../../data/data-sources/ydb/ydb-module";
import { SessionRepository } from "../../../../../data/repositories/session-repository";
import { CreateSessionUseCase } from "../../../../../domain/use-cases/sessions/create-session-use-case";

import { SessionsController } from "./controllers/sessions/sessions-controller";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: `env/.env.${process.env.NODE_ENV || "development"}`,
        }),
        YdbModule, 
    ],
    controllers: [SessionsController],
    providers: [
        CreateSessionUseCase,
        SessionRepository,
        SessionDataSource,
    ],
})
export class WdModule {}
