import { ConfigService } from "@nestjs/config";

import { InternalError } from "../../../domain/entities/error/internal-error";

import { DockerClient } from "./docker/docker-client";
import {
    buildDockerEnvironmentConfig,
    defaultInternalPort,
    defaultSessionTimeoutSeconds,
    DockerEnvironmentDataSource,
} from "./docker/environment-data-source";
import { EnvironmentDataSource } from "./environment-data-source";
import { LocalEnvironmentDataSource } from "./local/environment-data-source";
import { LocalComputeStore } from "./local/local-compute-store";

export const EnvironmentDataSourceProvider = {
    provide: EnvironmentDataSource,
    useFactory: (configService: ConfigService, store: LocalComputeStore): EnvironmentDataSource => {
        const provider = configService.getOrThrow<"local" | "docker">("COMPUTE_PROVIDER");

        switch (provider) {
            case "local":
                return new LocalEnvironmentDataSource(store);
            case "docker":
                return new DockerEnvironmentDataSource(new DockerClient(), dockerConfig(configService));
            default:
                throw new InternalError(`compute provider: ${provider}: unknown`);
        }
    },
    inject: [ConfigService, LocalComputeStore],
};

function dockerConfig(configService: ConfigService): ReturnType<typeof buildDockerEnvironmentConfig> {
    const image = configService.get<string>("COMPUTE_DOCKER_IMAGE");
    const internalPort = Number(configService.get<string>("COMPUTE_DOCKER_PORT") ?? String(defaultInternalPort));
    const sessionTimeout = Number(configService.get<string>("COMPUTE_DOCKER_SESSION_TIMEOUT") ?? String(defaultSessionTimeoutSeconds));

    return buildDockerEnvironmentConfig(image, internalPort, sessionTimeout);
}
