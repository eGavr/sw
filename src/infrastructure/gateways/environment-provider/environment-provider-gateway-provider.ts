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
import { KubernetesClient } from "./kubernetes/kubernetes-client";
import {
    defaultContainerPort,
    defaultNodePortRange,
    defaultSessionTimeoutSeconds as defaultK8sSessionTimeoutSeconds,
    KubernetesEnvironmentConfig,
} from "./kubernetes/kubernetes-environment-config";
import {
    KubernetesEnvironmentProviderGateway,
} from "./kubernetes/kubernetes-environment-provider-gateway";
import { LocalEnvironmentProviderGateway } from "./local-environment-provider-gateway";
import { RoutingEnvironmentProviderGateway } from "./routing-environment-provider-gateway";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Every supported adapter is registered up front (construction is cheap — the Docker client only
// shells out per command). The routing gateway then dispatches each action to the adapter of the
// environment's provider type, replacing the install-wide COMPUTE_PROVIDER switch.
export const EnvironmentProviderGatewayProvider = {
    provide: EnvironmentProviderGateway,
    useFactory: (configService: ConfigService): EnvironmentProviderGateway => {
        const gateways = new Map<string, EnvironmentProviderGateway>([
            ["local", new LocalEnvironmentProviderGateway()],
            ["docker", new DockerEnvironmentProviderGateway(new DockerClient(), dockerConfig(configService))],
            ["kubernetes", new KubernetesEnvironmentProviderGateway(
                new KubernetesClient(configService.get<string>("COMPUTE_K8S_CONTEXT")),
                kubernetesConfig(configService),
            )],
        ]);

        return new RoutingEnvironmentProviderGateway(gateways);
    },
    inject: [ConfigService],
};

function dockerConfig(configService: ConfigService): DockerEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return buildDockerEnvironmentConfig({
        image: configService.get<string>("COMPUTE_DOCKER_IMAGE"),
        baseImage: configService.get<string>("COMPUTE_DOCKER_BASE_IMAGE"),
        platform: configService.get<string>("COMPUTE_DOCKER_PLATFORM"),
        internalPort: Number(configService.get<string>("COMPUTE_DOCKER_PORT") ?? String(defaultInternalPort)),
        sessionTimeoutSeconds: Number(
            configService.get<string>("COMPUTE_DOCKER_SESSION_TIMEOUT") ?? String(defaultSessionTimeoutSeconds),
        ),
        // The host address the browser node is reachable at; on the dev Mac that is the loopback the
        // wd proxy uses to reach the published container port.
        advertiseHost: configService.get<string>("COMPUTE_DOCKER_ADVERTISE_HOST") ?? "127.0.0.1",
        // From inside the container the host's internal callback API is reached via host.docker.internal.
        internalUrl:
            configService.get<string>("COMPUTE_DOCKER_INTERNAL_URL") ?? `http://host.docker.internal:${internalPort}`,
        internalSecret: configService.get<string>("INTERNAL_API_SECRET") ?? "",
    });
}

function kubernetesConfig(configService: ConfigService): KubernetesEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return {
        image: configService.get<string>("COMPUTE_K8S_IMAGE") ?? "sw/environment-agent:latest",
        containerPort: Number(configService.get<string>("COMPUTE_K8S_PORT") ?? String(defaultContainerPort)),
        sessionTimeoutSeconds: Number(
            configService.get<string>("COMPUTE_K8S_SESSION_TIMEOUT") ?? String(defaultK8sSessionTimeoutSeconds),
        ),
        nodePortRange: {
            min: Number(configService.get<string>("COMPUTE_K8S_NODEPORT_MIN") ?? String(defaultNodePortRange.min)),
            max: Number(configService.get<string>("COMPUTE_K8S_NODEPORT_MAX") ?? String(defaultNodePortRange.max)),
        },
        // On the dev Mac the wd proxy reaches the cluster's host-mapped node ports on the loopback.
        advertiseHost: configService.get<string>("COMPUTE_K8S_ADVERTISE_HOST") ?? "127.0.0.1",
        // From inside a pod the host's internal callback API is reachable via host.docker.internal.
        internalUrl:
            configService.get<string>("COMPUTE_K8S_INTERNAL_URL") ?? `http://host.docker.internal:${internalPort}`,
        internalSecret: configService.get<string>("INTERNAL_API_SECRET") ?? "",
        context: configService.get<string>("COMPUTE_K8S_CONTEXT"),
    };
}
