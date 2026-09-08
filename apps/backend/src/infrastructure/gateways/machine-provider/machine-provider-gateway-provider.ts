import { ConfigService } from "@nestjs/config";

import { MachineProviderGateway } from "../../../application/interfaces/gateways/machine-provider-gateway";
import { LeaseTokenService } from "../../../application/interfaces/lease-token-service";
import { Logger } from "../../logging/logger";

import { ByoMachineProvider } from "./byo-machine/byo-machine-provider";
import { LocalMachineAgentLauncher } from "./byo-machine/local-machine-agent-launcher";
import { RoutingMachineProviderGateway } from "./routing-machine-provider-gateway";
import { YandexBaremetalClient } from "./yandex-baremetal/yandex-baremetal-client";
import { YandexBaremetalMachineProvider } from "./yandex-baremetal/yandex-baremetal-machine-provider";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Where each cloud's big machines come from, behind one routed port keyed by CLOUD TYPE (no
// vocabulary of its own): yandex-cloud leases metal in the binding's folder, local is the operator's
// own machines attached by hand (dev Macs, lab boxes). Adapter classes are named by mechanism and
// reusable — a new cloud with big machines adds an entry here, the pool code never changes.
export const MachineProviderGatewayProvider = {
    provide: MachineProviderGateway,
    useFactory: (
        configService: ConfigService,
        leaseTokens: LeaseTokenService,
        logger: Logger,
    ): MachineProviderGateway => {
        const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);
        const baremetalInternalUrl = configService.get<string>("COMPUTE_BAREMETAL_INTERNAL_URL")
            ?? `http://127.0.0.1:${internalPort}`;
        // The local box always reaches the internal API over loopback — never the baremetal VPC URL.
        const localInternalUrl = `http://127.0.0.1:${internalPort}`;

        // On the `local` cloud the CP runs on the same machine as the pool host, so it can start the
        // agent itself (MACHINE_POOL_LOCAL_AUTOSTART) instead of a human — the zero-ceremony dev flow;
        // MACHINE_AGENT_EMULATOR_WINDOW shows the emulator in a native window (no per-slot VNC yet).
        const localAutostart = configService.get<string>("MACHINE_POOL_LOCAL_AUTOSTART") === "true";
        const emulatorWindow = configService.get<string>("MACHINE_AGENT_EMULATOR_WINDOW") === "true";

        return new RoutingMachineProviderGateway(new Map<string, MachineProviderGateway>([
            ["yandex-cloud", new YandexBaremetalMachineProvider(
                new YandexBaremetalClient(configService.get<string>("COMPUTE_BAREMETAL_FOLDER_ID")),
                {
                    configurationId: configService.get<string>("COMPUTE_BAREMETAL_CONFIGURATION_ID") ?? "",
                    zone: configService.get<string>("COMPUTE_BAREMETAL_ZONE") ?? "ru-central1-m",
                    subnetId: configService.get<string>("COMPUTE_BAREMETAL_SUBNET_ID"),
                    internalUrl: baremetalInternalUrl,
                },
                leaseTokens,
            )],
            ["local", new ByoMachineProvider(leaseTokens, localInternalUrl, logger, {
                emulatorWindow,
                launcher: localAutostart ? new LocalMachineAgentLauncher() : undefined,
            })],
        ]));
    },
    inject: [ConfigService, LeaseTokenService, Logger],
};
