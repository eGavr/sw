import { ConfigService } from "@nestjs/config";

import { MachineProviderGateway } from "../../../application/interfaces/gateways/machine-provider-gateway";
import { ClaimMachineUseCase } from "../../../application/use-cases/machines/claim-machine-use-case";
import { DiscardMachineUseCase } from "../../../application/use-cases/machines/discard-machine-use-case";
import { EnlistMachineUseCase } from "../../../application/use-cases/machines/enlist-machine-use-case";
import { ListMachineLeaseIdsUseCase } from "../../../application/use-cases/machines/list-machine-lease-ids-use-case";
import { MeasureHeadroomUseCase } from "../../../application/use-cases/machines/measure-headroom-use-case";
import { ReleaseMachineUseCase } from "../../../application/use-cases/machines/release-machine-use-case";
import { selfHostedCloudType } from "../../../domain/entities/machine/self-hosted-cloud-type";
import { defaultSlotsPerMachine } from "../environment-provider/machine-pool/machine-pool-environment-config";

import { RoutingMachineProviderGateway } from "./routing-machine-provider-gateway";
import { SelfHostedMachineProvider } from "./self-hosted/self-hosted-machine-provider";
import { YandexBaremetalClient } from "./yandex-baremetal/yandex-baremetal-client";
import { YandexBaremetalMachineProvider } from "./yandex-baremetal/yandex-baremetal-machine-provider";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Where each cloud's big machines come from, behind one routed port keyed by CLOUD TYPE (no
// vocabulary of its own): yandex-cloud leases metal in the binding's folder, self-hosted hands out the
// user's own attached machines from the inventory. A new cloud with big machines adds an entry here,
// the pool code never changes.
export const MachineProviderGatewayProvider = {
    provide: MachineProviderGateway,
    useFactory: (
        configService: ConfigService,
        claimMachine: ClaimMachineUseCase,
        releaseMachine: ReleaseMachineUseCase,
        listMachineLeaseIds: ListMachineLeaseIdsUseCase,
        measureHeadroom: MeasureHeadroomUseCase,
        enlistMachine: EnlistMachineUseCase,
        discardMachine: DiscardMachineUseCase,
    ): MachineProviderGateway => {
        const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);
        const baremetalInternalUrl = configService.get<string>("COMPUTE_BAREMETAL_INTERNAL_URL")
            ?? `http://127.0.0.1:${internalPort}`;

        return new RoutingMachineProviderGateway(new Map<string, MachineProviderGateway>([
            ["yandex-cloud", new YandexBaremetalMachineProvider(
                new YandexBaremetalClient(configService.get<string>("COMPUTE_BAREMETAL_FOLDER_ID")),
                {
                    configurationId: configService.get<string>("COMPUTE_BAREMETAL_CONFIGURATION_ID") ?? "",
                    zone: configService.get<string>("COMPUTE_BAREMETAL_ZONE") ?? "ru-central1-m",
                    subnetId: configService.get<string>("COMPUTE_BAREMETAL_SUBNET_ID"),
                    internalUrl: baremetalInternalUrl,
                    slotsPerMachine: Number(
                        configService.get<string>("MACHINE_POOL_SLOTS_PER_MACHINE") ?? String(defaultSlotsPerMachine),
                    ),
                },
                enlistMachine,
                discardMachine,
            )],
            [selfHostedCloudType, new SelfHostedMachineProvider(
                claimMachine,
                releaseMachine,
                listMachineLeaseIds,
                measureHeadroom,
            )],
        ]));
    },
    inject: [
        ConfigService,
        ClaimMachineUseCase,
        ReleaseMachineUseCase,
        ListMachineLeaseIdsUseCase,
        MeasureHeadroomUseCase,
        EnlistMachineUseCase,
        DiscardMachineUseCase,
    ],
};
