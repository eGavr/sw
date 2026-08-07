import { ConfigService } from "@nestjs/config";

import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";

import { DockerClient } from "./docker/docker-client";
import {
    buildDockerEnvironmentConfig,
    defaultInternalPort,
    defaultSessionTimeoutSeconds,
    DockerEnvironmentConfig,
} from "./docker/docker-environment-config";
import { DockerEnvironmentProviderGateway } from "./docker/docker-environment-provider-gateway";
import { LocalEnvironmentProviderGateway } from "./local-environment-provider-gateway";
import { RoutingEnvironmentProviderGateway } from "./routing-environment-provider-gateway";

// Every supported adapter is registered up front (construction is cheap — the Docker client only
// shells out per command). The routing gateway then dispatches each action to the adapter of the
// environment's provider type, replacing the install-wide COMPUTE_PROVIDER switch.
export const EnvironmentProviderGatewayProvider = {
    provide: EnvironmentProviderGateway,
    useFactory: (configService: ConfigService): EnvironmentProviderGateway => {
        const gateways = new Map<string, EnvironmentProviderGateway>([
            ["local", new LocalEnvironmentProviderGateway()],
            ["docker", new DockerEnvironmentProviderGateway(new DockerClient(), dockerConfig(configService))],
        ]);

        return new RoutingEnvironmentProviderGateway(gateways);
    },
    inject: [ConfigService],
};

function dockerConfig(configService: ConfigService): DockerEnvironmentConfig {
    return buildDockerEnvironmentConfig({
        image: configService.get<string>("COMPUTE_DOCKER_IMAGE"),
        baseImage: configService.get<string>("COMPUTE_DOCKER_BASE_IMAGE"),
        platform: configService.get<string>("COMPUTE_DOCKER_PLATFORM"),
        internalPort: Number(configService.get<string>("COMPUTE_DOCKER_PORT") ?? String(defaultInternalPort)),
        sessionTimeoutSeconds: Number(
            configService.get<string>("COMPUTE_DOCKER_SESSION_TIMEOUT") ?? String(defaultSessionTimeoutSeconds),
        ),
    });
}
