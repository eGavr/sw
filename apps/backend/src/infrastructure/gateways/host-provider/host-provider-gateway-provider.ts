import { ConfigService } from "@nestjs/config";

import { HostProviderGateway } from "../../../application/interfaces/gateways/host-provider-gateway";
import { HostTokenService } from "../../../application/interfaces/host-token-service";
import { Logger } from "../../logging/logger";

import {
    RoutingHostProviderGateway,
    staticHostProviderKey,
    yandexBaremetalHostProviderKey,
} from "./routing-host-provider-gateway";
import { StaticHostProvider } from "./static/static-host-provider";
import { YandexBaremetalClient } from "./yandex-baremetal/yandex-baremetal-client";
import { YandexBaremetalHostProvider } from "./yandex-baremetal/yandex-baremetal-host-provider";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Every host provider of this install, behind one routed port: yandex-baremetal leases real machines
// in the binding's folder, static is the operator's own machine (dev Mac, lab box). A new cloud with
// big machines plugs in here — the pool code never changes.
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
            [yandexBaremetalHostProviderKey, new YandexBaremetalHostProvider(
                new YandexBaremetalClient(configService.get<string>("COMPUTE_BAREMETAL_FOLDER_ID")),
                {
                    configurationId: configService.get<string>("COMPUTE_BAREMETAL_CONFIGURATION_ID") ?? "",
                    zone: configService.get<string>("COMPUTE_BAREMETAL_ZONE") ?? "ru-central1-m",
                    subnetId: configService.get<string>("COMPUTE_BAREMETAL_SUBNET_ID"),
                    internalUrl,
                },
                hostTokens,
            )],
            [staticHostProviderKey, new StaticHostProvider(hostTokens, internalUrl, logger)],
        ]));
    },
    inject: [ConfigService, HostTokenService, Logger],
};
