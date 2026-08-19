import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { Logger as ApplicationLogger } from "../../application/interfaces/logger";
import { EnvironmentRepository } from "../../application/interfaces/repositories/environment-repository";
import { ProviderAccountRepository } from "../../application/interfaces/repositories/provider-account-repository";
import {
    CollectGarbageEnvironmentsUseCase,
} from "../../application/use-cases/environments/collect-garbage-environments-use-case";
import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../application/use-cases/environments/prepare-next-environment-use-case";
import {
    ReclaimCrashedEnvironmentsUseCase,
} from "../../application/use-cases/environments/reclaim-crashed-environments-use-case";
import {
    ReclaimStuckEnvironmentsUseCase,
} from "../../application/use-cases/environments/reclaim-stuck-environments-use-case";
import { EnvironmentDataSource } from "../../infrastructure/data-sources/database/postgres/environment-data-source";
import {
    ProviderAccountDataSource,
} from "../../infrastructure/data-sources/database/postgres/provider-account-data-source";
import { PostgresModule } from "../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayProvider,
} from "../../infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import { Logger } from "../../infrastructure/logging/logger";
import { LoggerModule } from "../../infrastructure/logging/logger-module";
import { EnvironmentRepositoryImpl } from "../../infrastructure/repositories/environment-repository-impl";
import {
    ProviderAccountRepositoryImpl,
} from "../../infrastructure/repositories/provider-account-repository-impl";

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
        ReclaimStuckEnvironmentsUseCase,
        ReclaimCrashedEnvironmentsUseCase,
        CollectGarbageEnvironmentsUseCase,
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
        { provide: ApplicationLogger, useExisting: Logger },
        EnvironmentDataSource,
        ProviderAccountDataSource,
        EnvironmentProviderGatewayProvider,
    ],
})
export class WorkerModule {}
