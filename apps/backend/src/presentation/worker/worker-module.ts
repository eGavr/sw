import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { Logger as ApplicationLogger } from "../../application/interfaces/logger";
import { CloudAccountRepository } from "../../application/interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../application/interfaces/repositories/environment-repository";
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
import {
    ReleaseStaleReservationsUseCase,
} from "../../application/use-cases/environments/release-stale-reservations-use-case";
import { AgentTokenServiceProvider } from "../../infrastructure/agent-token/agent-token-service-provider";
import {
    CloudAccountDataSource,
} from "../../infrastructure/data-sources/database/postgres/cloud-account-data-source";
import { EnvironmentDataSource } from "../../infrastructure/data-sources/database/postgres/environment-data-source";
import { PostgresModule } from "../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayProvider,
} from "../../infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import { Logger } from "../../infrastructure/logging/logger";
import { LoggerModule } from "../../infrastructure/logging/logger-module";
import {
    CloudAccountRepositoryImpl,
} from "../../infrastructure/repositories/cloud-account-repository-impl";
import { EnvironmentRepositoryImpl } from "../../infrastructure/repositories/environment-repository-impl";

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
        ReleaseStaleReservationsUseCase,
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
        { provide: ApplicationLogger, useExisting: Logger },
        EnvironmentDataSource,
        CloudAccountDataSource,
        AgentTokenServiceProvider,
        EnvironmentProviderGatewayProvider,
    ],
})
export class WorkerModule {}
