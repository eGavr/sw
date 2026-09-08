import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { Logger as ApplicationLogger } from "../../application/interfaces/logger";
import { CloudAccountRepository } from "../../application/interfaces/repositories/cloud-account-repository";
import { EnvironmentRepository } from "../../application/interfaces/repositories/environment-repository";
import { MachineLeaseRepository } from "../../application/interfaces/repositories/machine-lease-repository";
import { MachineRepository } from "../../application/interfaces/repositories/machine-repository";
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
import { PlaceWorkloadUseCase } from "../../application/use-cases/machine-pool/place-workload-use-case";
import {
    ReconcileMachinePoolUseCase,
} from "../../application/use-cases/machine-pool/reconcile-machine-pool-use-case";
import { ReleaseWorkloadUseCase } from "../../application/use-cases/machine-pool/release-workload-use-case";
import { ClaimMachineUseCase } from "../../application/use-cases/machines/claim-machine-use-case";
import { DiscardMachineUseCase } from "../../application/use-cases/machines/discard-machine-use-case";
import { EnlistMachineUseCase } from "../../application/use-cases/machines/enlist-machine-use-case";
import { ListMachineLeaseIdsUseCase } from "../../application/use-cases/machines/list-machine-lease-ids-use-case";
import {
    MarkSilentMachinesOfflineUseCase,
} from "../../application/use-cases/machines/mark-silent-machines-offline-use-case";
import { MeasureHeadroomUseCase } from "../../application/use-cases/machines/measure-headroom-use-case";
import { ReleaseMachineUseCase } from "../../application/use-cases/machines/release-machine-use-case";
import { AgentTokenServiceProvider } from "../../infrastructure/agent-token/agent-token-service-provider";
import {
    CloudAccountDataSource,
} from "../../infrastructure/data-sources/database/postgres/cloud-account-data-source";
import { EnvironmentDataSource } from "../../infrastructure/data-sources/database/postgres/environment-data-source";
import { MachineDataSource } from "../../infrastructure/data-sources/database/postgres/machine-data-source";
import {
    MachineLeaseDataSource,
} from "../../infrastructure/data-sources/database/postgres/machine-lease-data-source";
import { PostgresModule } from "../../infrastructure/data-sources/database/postgres/typeorm/postgres-module";
import {
    EnvironmentProviderGatewayProvider,
} from "../../infrastructure/gateways/environment-provider/environment-provider-gateway-provider";
import {
    MachineProviderGatewayProvider,
} from "../../infrastructure/gateways/machine-provider/machine-provider-gateway-provider";
import { Logger } from "../../infrastructure/logging/logger";
import { LoggerModule } from "../../infrastructure/logging/logger-module";
import {
    EnvironmentQuotaPolicyProvider,
} from "../../infrastructure/quota/environment-quota-policy-provider";
import {
    RegistrationTokenServiceProvider,
} from "../../infrastructure/registration-token/registration-token-service-provider";
import {
    CloudAccountRepositoryImpl,
} from "../../infrastructure/repositories/cloud-account-repository-impl";
import { EnvironmentRepositoryImpl } from "../../infrastructure/repositories/environment-repository-impl";
import { MachineLeaseRepositoryImpl } from "../../infrastructure/repositories/machine-lease-repository-impl";
import { MachineRepositoryImpl } from "../../infrastructure/repositories/machine-repository-impl";

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
        ReconcileMachinePoolUseCase,
        ClaimMachineUseCase,
        ReleaseMachineUseCase,
        ListMachineLeaseIdsUseCase,
        MeasureHeadroomUseCase,
        EnlistMachineUseCase,
        DiscardMachineUseCase,
        MarkSilentMachinesOfflineUseCase,
        { provide: EnvironmentRepository, useClass: EnvironmentRepositoryImpl },
        { provide: CloudAccountRepository, useClass: CloudAccountRepositoryImpl },
        { provide: MachineLeaseRepository, useClass: MachineLeaseRepositoryImpl },
        { provide: MachineRepository, useClass: MachineRepositoryImpl },
        { provide: ApplicationLogger, useExisting: Logger },
        EnvironmentDataSource,
        CloudAccountDataSource,
        MachineLeaseDataSource,
        MachineDataSource,
        AgentTokenServiceProvider,
        EnvironmentQuotaPolicyProvider,
        RegistrationTokenServiceProvider,
        MachineProviderGatewayProvider,
        EnvironmentProviderGatewayProvider,
    ],
})
export class WorkerModule {}
