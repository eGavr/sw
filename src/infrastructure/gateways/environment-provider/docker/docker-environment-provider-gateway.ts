import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { EnvironmentProviderGateway } from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { Environment } from "../../../../domain/entities/environment/environment";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";
import { ProviderAccount } from "../../../../domain/entities/provider-account/provider-account";
import { agentBootstrap, sessionLogFile } from "../agent-bootstrap";

import { DockerClient } from "./docker-client";
import { DockerEnvironmentConfig, resolveDockerProvisioning } from "./docker-environment-config";
import { dockerProvisioningOverrides } from "./docker-provider-config";
import { reserveFreePort } from "./free-port";
import { dockerLabels, dockerProviderValue } from "./labels";

// Docker adapter: an environment is a stock selenium container exposing a WebDriver endpoint. provision
// is idempotent (any stale container for the env id is removed before a fresh run), so a reclaim retry
// never leaks a second container. The endpoint is NOT written here — the in-container agent reports it on
// registration. Because a container cannot know its own published host port, the adapter reserves a free
// host port, publishes the node on it, and injects the endpoint plus the callback URL/secret. The agent
// itself is fetched from the control plane at startup (bootstrap command), not baked into the image.
export class DockerEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly docker: DockerClient,
        private readonly config: DockerEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super();
    }

    async provision(environment: Environment, providerAccount: ProviderAccount | null): Promise<void> {
        await this.removeByEnvironmentId(environment.id);

        const [application] = environment.applications.toArray();

        if (!application) {
            throw new InvalidArgumentError("environment: at least one application is required");
        }

        // The provisioning shape comes from the environment's provider account when set, falling back to
        // the install default; the install-level fields (callback URL/secret, advertise host) stay global.
        const overrides = dockerProvisioningOverrides(providerAccount?.config);
        const provisioning = resolveDockerProvisioning(application, {
            image: overrides.image ?? this.config.image,
            baseImage: overrides.baseImage ?? this.config.baseImage,
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
            command: ["-c", agentBootstrap(this.config.entrypoint)],
            env: {
                SW_ENVIRONMENT_ID: environment.id,
                SW_ENDPOINT: endpoint,
                SW_INTERNAL_URL: this.config.internalUrl,
                SW_INTERNAL_TOKEN: await this.agentTokens.issue(environment.id),
                // The bootstrap redirects the container's stdout here; the agent slices session logs from it.
                SW_SESSION_LOG_GLOB: sessionLogFile,
                // Delegate the smart idle timeout and the "one active session" invariant to the node.
                SE_NODE_SESSION_TIMEOUT: String(this.config.sessionTimeoutSeconds),
                SE_NODE_MAX_SESSIONS: "1",
                SE_NODE_OVERRIDE_MAX_SESSIONS: "true",
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

    private async removeByEnvironmentId(environmentId: string): Promise<void> {
        const [containerId] = await this.docker.listByLabel(dockerLabels.environmentId, environmentId);

        if (containerId) {
            await this.docker.remove(containerId);
        }
    }
}
