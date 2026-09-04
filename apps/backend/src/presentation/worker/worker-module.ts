import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { Logger as ApplicationLogger } from "../../application/interfaces/logger";
import { CloudAccountRepository } from "../../application/interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../application/interfaces/repositories/environment-repository";
import { PoolHostRepository } from "../../application/interfaces/repositories/pool-host-repository";
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
import { PlaceWorkloadUseCase } from "../../application/use-cases/host-pool/place-workload-use-case";
import {
    ReconcileHostPoolUseCase,
} from "../../application/use-cases/host-pool/reconcile-host-pool-use-case";
import { ReleaseWorkloadUseCase } from "../../application/use-cases/host-pool/release-workload-use-case";
import { AgentTokenServiceProvider } from "../../infrastructure/agent-token/agent-token-service-provider";
import {
    CloudAccountDataSource,
} from "../../infrastructure/data-sources/database/postgres/cloud-account-data-source";
import { EnvironmentDataSource } from "../../infrastructure/data-sources/database/postgres/environment-data-source";
import {
    PoolHostDataSource,
} from "../../infrastructure/data-sources/database/postgres/pool-host-data-source";
import { PostgresModule } from "../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayProvider,
} from "../../infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import {
    HostProviderGatewayProvider,
} from "../../infrastructure/gateways/host-provider/host-provider-gateway-provider";
import { HostTokenServiceProvider } from "../../infrastructure/host-token/host-token-service-provider";
import { Logger } from "../../infrastructure/logging/logger";
import { LoggerModule } from "../../infrastructure/logging/logger-module";
import {
    EnvironmentQuotaPolicyProvider,
} from "../../infrastructure/quota/environment-quota-policy-provider";
import {
    CloudAccountRepositoryImpl,
} from "../../infrastructure/repositories/cloud-account-repository-impl";
import { EnvironmentRepositoryImpl } from "../../infrastructure/repositories/environment-repository-impl";
import { PoolHostRepositoryImpl } from "../../infrastructure/repositories/pool-host-repository-impl";

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
        PlaceWorkloadUseCase,
        ReleaseWorkloadUseCase,
        ReconcileHostPoolUseCase,
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
        { provide: PoolHostRepository, useClass: PoolHostRepositoryImpl },
        { provide: ApplicationLogger, useExisting: Logger },
        EnvironmentDataSource,
        CloudAccountDataSource,
        PoolHostDataSource,
        AgentTokenServiceProvider,
        EnvironmentQuotaPolicyProvider,
        HostTokenServiceProvider,
        HostProviderGatewayProvider,
        EnvironmentProviderGatewayProvider,
    ],
})
export class WorkerModule {}
