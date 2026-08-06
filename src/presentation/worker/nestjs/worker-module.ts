import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../../application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../../application/use-cases/environments/prepare-next-environment-use-case";
import { EnvironmentDataSource } from "../../../infrastructure/data-sources/database/postgres/environment-data-source";
import { PostgresModule } from "../../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayProvider,
} from "../../../infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import { LoggerModule } from "../../../infrastructure/logging/logger-module";
import { EnvironmentRepository } from "../../../infrastructure/repositories/environment-repository";

import { EnvironmentWorker } from "./environment-worker";

@Module({
    imports: [
        ConfigModule.forRoot({
            envFilePath: [".env", `env/.env.${process.env.NODE_ENV || "development"}`],
        }),
        PostgresModule,
        LoggerModule,
    ],
    providers: [
        EnvironmentWorker,
        PrepareNextEnvironmentUseCase,
        DeprovisionDeletingEnvironmentsUseCase,
        EnvironmentRepository,
        EnvironmentDataSource,
        EnvironmentProviderGatewayProvider,
    ],
})
export class WorkerModule {}
