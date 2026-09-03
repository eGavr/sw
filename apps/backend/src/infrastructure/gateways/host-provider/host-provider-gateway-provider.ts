import { ConfigService } from "@nestjs/config";

import { HostProviderGateway } from "../../../application/interfaces/gateways/host-provider-gateway";
import { HostTokenService } from "../../../application/interfaces/host-token-service";

import { YandexBaremetalClient } from "./yandex-baremetal/yandex-baremetal-client";
import { YandexBaremetalHostProvider } from "./yandex-baremetal/yandex-baremetal-host-provider";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// The one host provider of this install (yandex-baremetal). When a second cloud with big machines
// arrives this becomes a routed map like the environment provider — the pool code never changes.
export const HostProviderGatewayProvider = {
    provide: HostProviderGateway,
    useFactory: (configService: ConfigService, hostTokens: HostTokenService): HostProviderGateway => {
        const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

        return new YandexBaremetalHostProvider(
            new YandexBaremetalClient(configService.get<string>("COMPUTE_BAREMETAL_FOLDER_ID")),
            {
                configurationId: configService.get<string>("COMPUTE_BAREMETAL_CONFIGURATION_ID") ?? "",
                zone: configService.get<string>("COMPUTE_BAREMETAL_ZONE") ?? "ru-central1-m",
                subnetId: configService.get<string>("COMPUTE_BAREMETAL_SUBNET_ID"),
                internalUrl: configService.get<string>("COMPUTE_BAREMETAL_INTERNAL_URL")
                    ?? `http://127.0.0.1:${internalPort}`,
            },
            hostTokens,
        );
    },
    inject: [ConfigService, HostTokenService],
};
