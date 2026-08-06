import { ConfigService } from "@nestjs/config";

import { InternalError } from "../../../domain/entities/error/internal-error";
import { DockerClient } from "../../data-sources/compute/docker/docker-client";
import {
    buildDockerEnvironmentConfig,
    defaultInternalPort,
    defaultSessionTimeoutSeconds,
    DockerEnvironmentConfig,
} from "../../data-sources/compute/docker/environment-data-source";

import { DockerEnvironmentProviderGateway } from "./docker/docker-environment-provider-gateway";
import { EnvironmentProviderGateway } from "./environment-provider-gateway";
import { LocalEnvironmentProviderGateway } from "./local-environment-provider-gateway";

export const EnvironmentProviderGatewayProvider = {
    provide: EnvironmentProviderGateway,
    useFactory: (configService: ConfigService): EnvironmentProviderGateway => {
        const provider = configService.getOrThrow<"local" | "docker">("COMPUTE_PROVIDER");

        switch (provider) {
            case "local":
                return new LocalEnvironmentProviderGateway();
            case "docker":
                return new DockerEnvironmentProviderGateway(new DockerClient(), dockerConfig(configService));
            default:
                throw new InternalError(`compute provider: ${provider}: unknown`);
        }
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
