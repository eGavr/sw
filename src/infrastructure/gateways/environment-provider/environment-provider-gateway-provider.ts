import { ConfigService } from "@nestjs/config";

import { AgentTokenService } from "../../../application/interfaces/agent-token-service";
import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";
import { ProviderCatalog } from "../../../application/interfaces/provider-catalog";
import { SessionIdleTimeout } from "../../../domain/entities/session/session-idle-timeout";

import { defaultAgentEntrypoint } from "./agent-bootstrap";
import {
    AndroidEmulatorEnvironmentConfig,
    buildAndroidEmulatorEnvironmentConfig,
    defaultEmulatorAndroidVersion,
    defaultEmulatorCores,
    defaultEmulatorDiskGb,
    defaultEmulatorMemoryGb,
} from "./android-emulator/android-emulator-environment-config";
import {
    AndroidEmulatorEnvironmentProviderGateway,
    androidEmulatorProviderValue,
} from "./android-emulator/android-emulator-environment-provider-gateway";
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
    defaultInternalPort,
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
    KubernetesEnvironmentConfig,
    KubernetesNetworking,
} from "./kubernetes/kubernetes-environment-config";
import {
    KubernetesEnvironmentProviderGateway,
} from "./kubernetes/kubernetes-environment-provider-gateway";
import { NoopEnvironmentProviderGateway } from "./noop-environment-provider-gateway";
import { RegisteredProviderCatalog } from "./registered-provider-catalog";
import { RoutingEnvironmentProviderGateway } from "./routing-environment-provider-gateway";
import { YandexComputeClient } from "./yandex-compute/yandex-compute-client";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Every supported adapter is registered up front (construction is cheap — the Docker client only
// shells out per command). The routing gateway then dispatches each action to the adapter of the
// environment's provider type, replacing the install-wide COMPUTE_PROVIDER switch.
export const EnvironmentProviderGatewayProvider = {
    provide: EnvironmentProviderGateway,
    useFactory: (configService: ConfigService, agentTokens: AgentTokenService): EnvironmentProviderGateway => {
        // One backend-agnostic idle timeout (domain policy), translated by each gateway into the node's
        // SE_NODE_SESSION_TIMEOUT — no per-backend copy of the default.
        const idleTimeoutSeconds = resolveSessionIdleTimeout(configService).toSeconds();

        const gateways = new Map<string, EnvironmentProviderGateway>([
            ["noop", new NoopEnvironmentProviderGateway()],
            ["docker", new DockerEnvironmentProviderGateway(
                new DockerClient(),
                dockerConfig(configService, idleTimeoutSeconds),
                agentTokens,
            )],
            ["kubernetes", new KubernetesEnvironmentProviderGateway(
                new KubernetesClient(
                    configService.get<string>("COMPUTE_K8S_NAMESPACE") ?? defaultNamespace,
                    configService.get<string>("COMPUTE_K8S_CONTEXT"),
                ),
                kubernetesConfig(configService, idleTimeoutSeconds),
                agentTokens,
            )],
            [androidRedroidProviderValue, new AndroidRedroidEnvironmentProviderGateway(
                new YandexComputeClient(configService.get<string>("COMPUTE_ANDROID_FOLDER_ID")),
                androidRedroidConfig(configService),
                agentTokens,
            )],
            [androidEmulatorProviderValue, new AndroidEmulatorEnvironmentProviderGateway(
                new YandexComputeClient(configService.get<string>("COMPUTE_ANDROID_EMULATOR_FOLDER_ID")),
                androidEmulatorConfig(configService),
                agentTokens,
            )],
        ]);

        return new RoutingEnvironmentProviderGateway(gateways);
    },
    inject: [ConfigService, AgentTokenService],
};

// The provider keys the routing gateway registers adapters for (mirror of the map keys above). create-project
// validates a requested provider against this catalog so an unknown provider fails fast (400) at create time
// rather than later at provision.
export const registeredProviderTypes: ReadonlyArray<string> = [
    "noop",
    "docker",
    "kubernetes",
    androidRedroidProviderValue,
    androidEmulatorProviderValue,
];

export const ProviderCatalogProvider = {
    provide: ProviderCatalog,
    useValue: new RegisteredProviderCatalog(registeredProviderTypes),
};

// Resolves the one session idle timeout from SESSION_IDLE_TIMEOUT (a positive integer of seconds),
// falling back to the domain default. Bad config fails fast here rather than at provision time.
function resolveSessionIdleTimeout(configService: ConfigService): SessionIdleTimeout {
    const configured = configService.get<string>("SESSION_IDLE_TIMEOUT");

    return configured ? SessionIdleTimeout.ofSeconds(Number(configured)) : SessionIdleTimeout.default();
}

function dockerConfig(configService: ConfigService, sessionTimeoutSeconds: number): DockerEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    // Install defaults for the docker provisioning shape; a project's provider account config overrides
    // image/baseImage/platform/port at provision. The install-level fields below stay global.
    return {
        image: configService.get<string>("COMPUTE_DOCKER_IMAGE"),
        baseImage: configService.get<string>("COMPUTE_DOCKER_BASE_IMAGE"),
        platform: configService.get<string>("COMPUTE_DOCKER_PLATFORM"),
        internalPort: Number(configService.get<string>("COMPUTE_DOCKER_PORT") ?? String(defaultInternalPort)),
        sessionTimeoutSeconds,
        entrypoint: configService.get<string>("COMPUTE_DOCKER_ENTRYPOINT") ?? defaultAgentEntrypoint,
        // The host address the browser node is reachable at; on the dev Mac that is the loopback the
        // wd proxy uses to reach the published container port.
        advertiseHost: configService.get<string>("COMPUTE_DOCKER_ADVERTISE_HOST") ?? "127.0.0.1",
        // From inside the container the host's internal callback API is reached via host.docker.internal.
        internalUrl:
            configService.get<string>("COMPUTE_DOCKER_INTERNAL_URL") ?? `http://host.docker.internal:${internalPort}`,    
    };
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
    });
}

function androidEmulatorConfig(configService: ConfigService): AndroidEmulatorEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return buildAndroidEmulatorEnvironmentConfig({
        imageId: configService.get<string>("COMPUTE_ANDROID_EMULATOR_IMAGE_ID") ?? "",
        // KVM-capable hardware platform; unset falls back to the folder default (usable only where the
        // default platform already exposes /dev/kvm, e.g. bare metal).
        platformId: configService.get<string>("COMPUTE_ANDROID_EMULATOR_PLATFORM_ID"),
        zone: configService.get<string>("COMPUTE_ANDROID_EMULATOR_ZONE") ?? "ru-central1-a",
        subnetId: configService.get<string>("COMPUTE_ANDROID_EMULATOR_SUBNET_ID") ?? "",
        securityGroupId: configService.get<string>("COMPUTE_ANDROID_EMULATOR_SECURITY_GROUP_ID"),
        cores: Number(configService.get<string>("COMPUTE_ANDROID_EMULATOR_CORES") ?? String(defaultEmulatorCores)),
        memoryGb: Number(configService.get<string>("COMPUTE_ANDROID_EMULATOR_MEMORY_GB") ?? String(defaultEmulatorMemoryGb)),
        diskSizeGb: Number(configService.get<string>("COMPUTE_ANDROID_EMULATOR_DISK_GB") ?? String(defaultEmulatorDiskGb)),
        defaultAndroidVersion:
            configService.get<string>("COMPUTE_ANDROID_EMULATOR_DEFAULT_VERSION") ?? defaultEmulatorAndroidVersion,
        internalUrl: configService.get<string>("COMPUTE_ANDROID_EMULATOR_INTERNAL_URL") ?? `http://127.0.0.1:${internalPort}`,    
    });
}

function kubernetesConfig(configService: ConfigService, sessionTimeoutSeconds: number): KubernetesEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return {
        image: configService.get<string>("COMPUTE_K8S_IMAGE") ?? "seleniarm/standalone-chromium:latest",
        namespace: configService.get<string>("COMPUTE_K8S_NAMESPACE") ?? defaultNamespace,
        networking: (configService.get<string>("COMPUTE_K8S_NETWORKING") as KubernetesNetworking) ?? defaultNetworking,
        containerPort: Number(configService.get<string>("COMPUTE_K8S_PORT") ?? String(defaultContainerPort)),
        sessionTimeoutSeconds,
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
        context: configService.get<string>("COMPUTE_K8S_CONTEXT"),
    };
}
