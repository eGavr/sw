import { ConfigService } from "@nestjs/config";

import { HostProviderGateway } from "../../../application/interfaces/gateways/host-provider-gateway";
import { HostTokenService } from "../../../application/interfaces/host-token-service";
import { Logger } from "../../logging/logger";

import { ByoHostProvider } from "./byo-host/byo-host-provider";
import { RoutingHostProviderGateway } from "./routing-host-provider-gateway";
import { YandexBaremetalClient } from "./yandex-baremetal/yandex-baremetal-client";
import { YandexBaremetalHostProvider } from "./yandex-baremetal/yandex-baremetal-host-provider";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Where each cloud's big machines come from, behind one routed port keyed by CLOUD TYPE (no
// vocabulary of its own): yandex-cloud leases metal in the binding's folder, local is the operator's
// own machines attached by hand (dev Macs, lab boxes). Adapter classes are named by mechanism and
// reusable — a new cloud with big machines adds an entry here, the pool code never changes.
export const HostProviderGatewayProvider = {
    provide: HostProviderGateway,
    useFactory: (
        configService: ConfigService,
        hostTokens: HostTokenService,
        logger: Logger,
    ): HostProviderGateway => {
        const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);
        const internalUrl = configService.get<string>("COMPUTE_BAREMETAL_INTERNAL_URL")
            ?? `http://127.0.0.1:${internalPort}`;

        return new RoutingHostProviderGateway(new Map<string, HostProviderGateway>([
            ["yandex-cloud", new YandexBaremetalHostProvider(
                new YandexBaremetalClient(configService.get<string>("COMPUTE_BAREMETAL_FOLDER_ID")),
                {
                    configurationId: configService.get<string>("COMPUTE_BAREMETAL_CONFIGURATION_ID") ?? "",
                    zone: configService.get<string>("COMPUTE_BAREMETAL_ZONE") ?? "ru-central1-m",
                    subnetId: configService.get<string>("COMPUTE_BAREMETAL_SUBNET_ID"),
                    internalUrl,
                },
                hostTokens,
            )],
            ["local", new ByoHostProvider(hostTokens, internalUrl, logger)],
        ]));
    },
    inject: [ConfigService, HostTokenService, Logger],
};
