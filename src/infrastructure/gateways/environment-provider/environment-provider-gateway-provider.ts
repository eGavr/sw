import { ConfigService } from "@nestjs/config";

import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";

import { defaultAgentEntrypoint } from "./agent-bootstrap";
import {
    AndroidRedroidEnvironmentConfig,
    buildAndroidRedroidEnvironmentConfig,
    defaultAndroidCores,
    defaultAndroidDiskGb,
    defaultAndroidMemoryGb,
    defaultAndroidVersion,
} from "./android-redroid/android-redroid-environment-config";
import {
    AndroidRedroidEnvironmentProviderGateway,
    androidRedroidProviderValue,
} from "./android-redroid/android-redroid-environment-provider-gateway";
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
    defaultNamespace,
    defaultNetworking,
    defaultNodePortRange,
    defaultResources,
    defaultSessionTimeoutSeconds as defaultK8sSessionTimeoutSeconds,
    KubernetesEnvironmentConfig,
    KubernetesNetworking,
} from "./kubernetes/kubernetes-environment-config";
import {
    KubernetesEnvironmentProviderGateway,
} from "./kubernetes/kubernetes-environment-provider-gateway";
import { LocalEnvironmentProviderGateway } from "./local-environment-provider-gateway";
import { RoutingEnvironmentProviderGateway } from "./routing-environment-provider-gateway";
import { YandexComputeClient } from "./yandex-compute/yandex-compute-client";

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
                new KubernetesClient(
                    configService.get<string>("COMPUTE_K8S_NAMESPACE") ?? defaultNamespace,
                    configService.get<string>("COMPUTE_K8S_CONTEXT"),
                ),
                kubernetesConfig(configService),
            )],
            [androidRedroidProviderValue, new AndroidRedroidEnvironmentProviderGateway(
                new YandexComputeClient(configService.get<string>("COMPUTE_ANDROID_FOLDER_ID")),
                androidRedroidConfig(configService),
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
        entrypoint: configService.get<string>("COMPUTE_DOCKER_ENTRYPOINT") ?? defaultAgentEntrypoint,
        // The host address the browser node is reachable at; on the dev Mac that is the loopback the
        // wd proxy uses to reach the published container port.
        advertiseHost: configService.get<string>("COMPUTE_DOCKER_ADVERTISE_HOST") ?? "127.0.0.1",
        // From inside the container the host's internal callback API is reached via host.docker.internal.
        internalUrl:
            configService.get<string>("COMPUTE_DOCKER_INTERNAL_URL") ?? `http://host.docker.internal:${internalPort}`,
        internalSecret: configService.get<string>("INTERNAL_API_SECRET") ?? "",
    });
}

function androidRedroidConfig(configService: ConfigService): AndroidRedroidEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return buildAndroidRedroidEnvironmentConfig({
        imageId: configService.get<string>("COMPUTE_ANDROID_IMAGE_ID") ?? "",
        zone: configService.get<string>("COMPUTE_ANDROID_ZONE") ?? "ru-central1-a",
        subnetId: configService.get<string>("COMPUTE_ANDROID_SUBNET_ID") ?? "",
        securityGroupId: configService.get<string>("COMPUTE_ANDROID_SECURITY_GROUP_ID"),
        cores: Number(configService.get<string>("COMPUTE_ANDROID_CORES") ?? String(defaultAndroidCores)),
        memoryGb: Number(configService.get<string>("COMPUTE_ANDROID_MEMORY_GB") ?? String(defaultAndroidMemoryGb)),
        diskSizeGb: Number(configService.get<string>("COMPUTE_ANDROID_DISK_GB") ?? String(defaultAndroidDiskGb)),
        defaultAndroidVersion: configService.get<string>("COMPUTE_ANDROID_DEFAULT_VERSION") ?? defaultAndroidVersion,
        // The in-VM agent reaches the control plane's internal API here — a VPC-internal address (internal LB
        // in front of the internal service) reachable from the Compute VM.
        internalUrl: configService.get<string>("COMPUTE_ANDROID_INTERNAL_URL") ?? `http://127.0.0.1:${internalPort}`,
        internalSecret: configService.get<string>("INTERNAL_API_SECRET") ?? "",
    });
}

function kubernetesConfig(configService: ConfigService): KubernetesEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return {
        image: configService.get<string>("COMPUTE_K8S_IMAGE") ?? "seleniarm/standalone-chromium:latest",
        namespace: configService.get<string>("COMPUTE_K8S_NAMESPACE") ?? defaultNamespace,
        networking: (configService.get<string>("COMPUTE_K8S_NETWORKING") as KubernetesNetworking) ?? defaultNetworking,
        containerPort: Number(configService.get<string>("COMPUTE_K8S_PORT") ?? String(defaultContainerPort)),
        sessionTimeoutSeconds: Number(
            configService.get<string>("COMPUTE_K8S_SESSION_TIMEOUT") ?? String(defaultK8sSessionTimeoutSeconds),
        ),
        entrypoint: configService.get<string>("COMPUTE_K8S_ENTRYPOINT") ?? defaultAgentEntrypoint,
        nodePortRange: {
            min: Number(configService.get<string>("COMPUTE_K8S_NODEPORT_MIN") ?? String(defaultNodePortRange.min)),
            max: Number(configService.get<string>("COMPUTE_K8S_NODEPORT_MAX") ?? String(defaultNodePortRange.max)),
        },
        resources: {
            requests: {
                cpu: configService.get<string>("COMPUTE_K8S_CPU_REQUEST") ?? defaultResources.requests.cpu,
                memory: configService.get<string>("COMPUTE_K8S_MEMORY_REQUEST") ?? defaultResources.requests.memory,
            },
            limits: {
                cpu: configService.get<string>("COMPUTE_K8S_CPU_LIMIT") ?? defaultResources.limits.cpu,
                memory: configService.get<string>("COMPUTE_K8S_MEMORY_LIMIT") ?? defaultResources.limits.memory,
            },
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
