import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import {
    CloudReachability,
    EnvironmentProviderGateway,
    OwnershipVerification,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../../domain/entities/environment/environment";
import { agentBootstrap, linuxNodeEntrypoint, sessionLogFile } from "../agent-bootstrap";
import { linuxNodeProvisioning } from "../linux-node";
import { netBridgeProxyPort } from "../net-bridge-forwarder";

import { DockerClient } from "./docker-client";
import { DockerEnvironmentConfig } from "./docker-environment-config";
import { dockerProvisioningOverrides } from "./docker-provider-config";
import { reserveFreePort } from "./free-port";
import { dockerLabels, dockerProviderValue } from "./labels";

// Docker adapter: an environment is a linux base container (one image per ubuntu version) that turns
// itself into a browser node at start — the node script and the wd door come from the control plane,
// the browser and its webdriver are catalog artifacts pulled through it. provision is idempotent (any
// stale container for the env id is removed before a fresh run), so a reclaim retry never leaks a second
// container. The endpoint is NOT written here — the in-container agent reports it on registration.
// Because a container cannot know its own published host port, the adapter reserves a free host port,
// publishes the node on it, and injects the endpoint plus the callback URL/secret. The agent itself is
// fetched from the control plane at startup (bootstrap command), not baked into the image.
export class DockerEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly docker: DockerClient,
        private readonly config: DockerEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.removeByEnvironmentId(environment.id);

        // The provisioning shape comes from the environment's substrate binding when set, falling back to
        // the install default; the install-level fields (callback URL/secret, advertise host) stay global.
        const overrides = dockerProvisioningOverrides(
            cloudAccount?.computeBindingFor(environment.platform.name, environment.execution)?.config,
        );
        const provisioning = linuxNodeProvisioning({
            platform: environment.platform.toObject(),
            applications: environment.applications.toArray(),
            baseImage: overrides.baseImage ?? this.config.baseImage,
            sessionTimeoutSeconds: this.config.sessionTimeoutSeconds,
            screen: this.config.screen,
        });
        const platform = overrides.platform ?? this.config.platform;
        const internalPort = overrides.internalPort ?? this.config.internalPort;

        const hostPort = await reserveFreePort();
        const endpoint = `http://${this.config.advertiseHost}:${hostPort}`;

        await this.docker.run({
            image: provisioning.image,
            platform,
            publish: { host: hostPort, container: internalPort },
            shmSize: "2g",
            entrypoint: "bash",
            command: ["-c", agentBootstrap(linuxNodeEntrypoint)],
            env: {
                SW_ENVIRONMENT_ID: environment.id,
                SW_ENDPOINT: endpoint,
                SW_INTERNAL_URL: this.config.internalUrl,
                SW_INTERNAL_TOKEN: await this.agentTokens.issue(environment.id),
                // The bootstrap redirects the container's stdout here; the agent slices session logs from it.
                SW_SESSION_LOG_GLOB: sessionLogFile,
                // When set, the agent launches the NetBridge forwarder: a loopback SOCKS proxy the browser
                // uses, tunnelling out to the rendezvous. Reuses the per-env agent token as its bearer.
                ...this.netBridgeEnv(),
                ...provisioning.env,
            },
            labels: {
                [dockerLabels.provider]: dockerProviderValue,
                [dockerLabels.environmentId]: environment.id,
                [dockerLabels.projectId]: environment.projectId.getValue(),
            },
        });
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.removeByEnvironmentId(environment.id);
    }

    private netBridgeEnv(): Record<string, string> {
        if (!this.config.netBridgeUrl) {
            return {};
        }

        return {
            SW_NETBRIDGE_URL: this.config.netBridgeUrl,
            SW_NETBRIDGE_PROXY_PORT: String(netBridgeProxyPort),
        };
    }

    // local = the operator's own machine: "reachable" means its docker daemon answers. No credential or
    // folder to check — the cloud account itself is not consulted.
    async checkAccess(): Promise<CloudReachability> {
        try {
            await this.docker.version();

            return { reachable: true };
        } catch (error) {
            return { reachable: false, detail: error instanceof Error ? error.message : String(error) };
        }
    }

    // local = the operator's own machine: nothing is delegated, so there is no ownership to prove.
    async verifyOwnership(): Promise<OwnershipVerification> {
        return { verified: true };
    }

    private async removeByEnvironmentId(environmentId: string): Promise<void> {
        const [containerId] = await this.docker.listByLabel(dockerLabels.environmentId, environmentId);

        if (containerId) {
            await this.docker.remove(containerId);
        }
    }
}
