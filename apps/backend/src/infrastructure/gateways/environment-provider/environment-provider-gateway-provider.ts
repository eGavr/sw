import { ConfigService } from "@nestjs/config";

import { AgentTokenService } from "../../../application/interfaces/agent-token-service";
import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";
import { Execution } from "../../../domain/entities/environment/execution";
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
} from "./android-redroid/android-redroid-environment-provider-gateway";
import {
    BrowserVmEnvironmentConfig,
    defaultBrowserCores,
    defaultBrowserDiskGb,
    defaultBrowserMemoryGb,
} from "./browser-vm/browser-vm-environment-config";
import {
    BrowserVmEnvironmentProviderGateway,
} from "./browser-vm/browser-vm-environment-provider-gateway";
import { DockerClient } from "./docker/docker-client";
import {
    defaultInternalPort,
    DockerEnvironmentConfig,
} from "./docker/docker-environment-config";
import { DockerEnvironmentProviderGateway } from "./docker/docker-environment-provider-gateway";
import { KubernetesClient } from "./kubernetes/kubernetes-client";
import {
    buildKubernetesEnvironmentConfig,
    KubernetesEnvironmentConfig,
} from "./kubernetes/kubernetes-environment-config";
import {
    KubernetesEnvironmentProviderGateway,
} from "./kubernetes/kubernetes-environment-provider-gateway";
import { RoutingEnvironmentProviderGateway, routingKey } from "./routing-environment-provider-gateway";
import { YandexComputeClient } from "./yandex-compute/yandex-compute-client";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// Fallback wd (data-plane / NetBridge rendezvous) port when WD_PORT is unset; the env files set it to 3001.
const defaultWdPort = "3001";

// Every supported adapter is registered up front (construction is cheap — the Docker client only
// shells out per command). The routing gateway then dispatches each action to the adapter keyed by
// the environment's (cloud type, execution), replacing the install-wide COMPUTE_PROVIDER switch.
export const EnvironmentProviderGatewayProvider = {
    provide: EnvironmentProviderGateway,
    useFactory: (configService: ConfigService, agentTokens: AgentTokenService): EnvironmentProviderGateway => {
        // One backend-agnostic idle timeout (domain policy), translated by each gateway into the node's
        // SE_NODE_SESSION_TIMEOUT — no per-backend copy of the default.
        const idleTimeoutSeconds = resolveSessionIdleTimeout(configService).toSeconds();

        // Keyed by cloud type x stereotype (platform, execution): the environment carries all three and the
        // routing gateway dispatches here. Each entry is a subdivision of its cloud — the compute kind the
        // cloud provisions that stereotype with (local drives its docker daemon; yandex-cloud creates
        // Compute VMs for both android substrates).
        const gateways = new Map<string, EnvironmentProviderGateway>([
            [routingKey("local", "linux", Execution.Container, "docker"), new DockerEnvironmentProviderGateway(
                new DockerClient(),
                dockerConfig(configService, idleTimeoutSeconds),
                agentTokens,
            )],
            [routingKey("yandex-cloud", "android", Execution.Container, "vm"), new AndroidRedroidEnvironmentProviderGateway(
                new YandexComputeClient(configService.get<string>("COMPUTE_ANDROID_FOLDER_ID")),
                androidRedroidConfig(configService),
                agentTokens,
            )],
            [routingKey("yandex-cloud", "android", Execution.Emulator, "vm"), new AndroidEmulatorEnvironmentProviderGateway(
                new YandexComputeClient(configService.get<string>("COMPUTE_ANDROID_EMULATOR_FOLDER_ID")),
                androidEmulatorConfig(configService),
                agentTokens,
            )],
            [routingKey("yandex-cloud", "linux", Execution.Container, "vm"), new BrowserVmEnvironmentProviderGateway(
                new YandexComputeClient(configService.get<string>("COMPUTE_BROWSER_FOLDER_ID")),
                browserVmConfig(configService, idleTimeoutSeconds),
                agentTokens,
            )],
            [routingKey("yandex-cloud", "linux", Execution.Container, "kubernetes"),
                kubernetesGateway(configService, idleTimeoutSeconds, agentTokens)],
        ]);

        return new RoutingEnvironmentProviderGateway(gateways);
    },
    inject: [ConfigService, AgentTokenService],
};

// Resolves the one session idle timeout from SESSION_IDLE_TIMEOUT (a positive integer of seconds),
// falling back to the domain default. Bad config fails fast here rather than at provision time.
function resolveSessionIdleTimeout(configService: ConfigService): SessionIdleTimeout {
    const configured = configService.get<string>("SESSION_IDLE_TIMEOUT");

    return configured ? SessionIdleTimeout.ofSeconds(Number(configured)) : SessionIdleTimeout.default();
}

function dockerConfig(configService: ConfigService, sessionTimeoutSeconds: number): DockerEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);
    const wdPort = configService.get<string>("WD_PORT") ?? defaultWdPort;

    // Install defaults for the docker provisioning shape; a project's substrate binding config overrides
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
        // ws base of the NetBridge rendezvous (the wd service) the forwarder dials out to; from inside the
        // container the host is host.docker.internal. Unset via env to disable local-network tunnelling.
        netBridgeUrl:
            configService.get<string>("COMPUTE_DOCKER_NETBRIDGE_URL") ?? `ws://host.docker.internal:${wdPort}`,
    };
}

// Reads the COMPUTE_K8S_* env and hands it to the backend's builder, which owns the k8s-specific shaping
// (networking mode, node-port range, container port). The client is put in external/public-master mode
// exactly when the config asks for nodeport networking (delegated BYOC — the cluster is in the user's own
// folder, reached over public addresses).
function kubernetesGateway(
    configService: ConfigService,
    sessionTimeoutSeconds: number,
    agentTokens: AgentTokenService,
): KubernetesEnvironmentProviderGateway {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);
    const config: KubernetesEnvironmentConfig = buildKubernetesEnvironmentConfig({
        nodeImage: configService.get<string>("COMPUTE_K8S_NODE_IMAGE")
            ?? configService.get<string>("COMPUTE_BROWSER_NODE_IMAGE") ?? "",
        namespace: configService.get<string>("COMPUTE_K8S_NAMESPACE"),
        entrypoint: configService.get<string>("COMPUTE_K8S_ENTRYPOINT") ?? defaultAgentEntrypoint,
        cpuRequest: configService.get<string>("COMPUTE_K8S_CPU_REQUEST"),
        memoryRequest: configService.get<string>("COMPUTE_K8S_MEMORY_REQUEST"),
        cpuLimit: configService.get<string>("COMPUTE_K8S_CPU_LIMIT"),
        memoryLimit: configService.get<string>("COMPUTE_K8S_MEMORY_LIMIT"),
        sessionTimeoutSeconds,
        internalUrl: configService.get<string>("COMPUTE_K8S_INTERNAL_URL")
            ?? configService.get<string>("COMPUTE_BROWSER_INTERNAL_URL") ?? `http://127.0.0.1:${internalPort}`,
        networking: configService.get<string>("COMPUTE_K8S_NETWORKING"),
        nodePortMin: configService.get<string>("COMPUTE_K8S_NODEPORT_MIN"),
        nodePortMax: configService.get<string>("COMPUTE_K8S_NODEPORT_MAX"),
        containerPort: configService.get<string>("COMPUTE_K8S_CONTAINER_PORT"),
        advertiseHost: configService.get<string>("COMPUTE_K8S_ADVERTISE_HOST"),
    });

    return new KubernetesEnvironmentProviderGateway(
        new KubernetesClient(config.networking === "nodeport"),
        config,
        agentTokens,
    );
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

function browserVmConfig(configService: ConfigService, sessionTimeoutSeconds: number): BrowserVmEnvironmentConfig {
    const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

    return {
        imageId: configService.get<string>("COMPUTE_BROWSER_IMAGE_ID") ?? "",
        zone: configService.get<string>("COMPUTE_BROWSER_ZONE") ?? "ru-central1-a",
        subnetId: configService.get<string>("COMPUTE_BROWSER_SUBNET_ID") ?? "",
        securityGroupId: configService.get<string>("COMPUTE_BROWSER_SECURITY_GROUP_ID"),
        cores: Number(configService.get<string>("COMPUTE_BROWSER_CORES") ?? String(defaultBrowserCores)),
        memoryGb: Number(configService.get<string>("COMPUTE_BROWSER_MEMORY_GB") ?? String(defaultBrowserMemoryGb)),
        diskSizeGb: Number(configService.get<string>("COMPUTE_BROWSER_DISK_GB") ?? String(defaultBrowserDiskGb)),
        nodeImage: configService.get<string>("COMPUTE_BROWSER_NODE_IMAGE") ?? "",
        sessionTimeoutSeconds,
        internalUrl: configService.get<string>("COMPUTE_BROWSER_INTERNAL_URL") ?? `http://127.0.0.1:${internalPort}`,
    };
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

