import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { EnvironmentRepository } from "../../application/interfaces/repositories/environment-repository";
import { ProviderAccountRepository } from "../../application/interfaces/repositories/provider-account-repository";
import {
    DeprovisionDeletingEnvironmentsUseCase,
} from "../../application/use-cases/environments/deprovision-deleting-environments-use-case";
import {
    PrepareNextEnvironmentUseCase,
} from "../../application/use-cases/environments/prepare-next-environment-use-case";
import {
    ReclaimStuckEnvironmentsUseCase,
} from "../../application/use-cases/environments/reclaim-stuck-environments-use-case";
import { EnvironmentDataSource } from "../../infrastructure/data-sources/database/postgres/environment-data-source";
import {
    ProviderAccountDataSource,
} from "../../infrastructure/data-sources/database/postgres/provider-account-data-source";
import { PostgresModule } from "../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayResolverProvider,
} from "../../infrastructure/gateways/environment-provider/environment-provider-gateway-resolver-provider";
import { LoggerModule } from "../../infrastructure/logging/logger-module";
import { EnvironmentRepositoryImpl } from "../../infrastructure/repositories/environment-repository-impl";
import { ProviderAccountRepositoryImpl } from "../../infrastructure/repositories/provider-account-repository-impl";

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
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: ProviderAccountRepository, useClass: ProviderAccountRepositoryImpl },
        EnvironmentDataSource,
        ProviderAccountDataSource,
        EnvironmentProviderGatewayResolverProvider,
    ],
})
export class WorkerModule {}
