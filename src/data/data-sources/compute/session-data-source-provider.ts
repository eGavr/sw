import { ConfigService } from "@nestjs/config";

import { InternalError } from "../../../domain/entities/error/internal-error";

import { DockerClient } from "./docker/docker-client";
import { buildDockerEnvironmentConfig, defaultInternalPort, DockerEnvironmentDataSource } from "./docker/environment-data-source";
import { DockerSessionDataSource } from "./docker/session-data-source";
import { WebDriverClient } from "./docker/webdriver-client";
import { LocalComputeStore } from "./local/local-compute-store";
import { LocalSessionDataSource } from "./local/session-data-source";
import { SessionDataSource } from "./session-data-source";

export const SessionDataSourceProvider = {
    provide: SessionDataSource,
    useFactory: (configService: ConfigService, store: LocalComputeStore): SessionDataSource => {
        const provider = configService.getOrThrow<"local" | "docker">("COMPUTE_PROVIDER");

        switch (provider) {
            case "local":
                return new LocalSessionDataSource(store);
            case "docker": {
                const environmentDataSource = new DockerEnvironmentDataSource(new DockerClient(), dockerConfig(configService));

                return new DockerSessionDataSource(environmentDataSource, new WebDriverClient());
            }
            default:
                throw new InternalError(`compute provider: ${provider}: unknown`);
        }
    },
    inject: [ConfigService, LocalComputeStore],
};

function dockerConfig(configService: ConfigService): ReturnType<typeof buildDockerEnvironmentConfig> {
    const image = configService.get<string>("COMPUTE_DOCKER_IMAGE");
    const internalPort = Number(configService.get<string>("COMPUTE_DOCKER_PORT") ?? String(defaultInternalPort));

    return buildDockerEnvironmentConfig(image, internalPort);
}
