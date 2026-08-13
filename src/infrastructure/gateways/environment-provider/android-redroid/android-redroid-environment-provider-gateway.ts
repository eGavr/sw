import { EnvironmentProviderGateway } from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { Environment } from "../../../../domain/entities/environment/environment";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";
import { agentBootstrap, sessionLogFile } from "../agent-bootstrap";
import { DockerClient } from "../docker/docker-client";
import { reserveFreePort } from "../docker/free-port";
import { dockerLabels } from "../docker/labels";

import { AndroidRedroidEnvironmentConfig } from "./android-redroid-environment-config";

export const androidRedroidProviderValue = "android-redroid";

// Android (redroid) adapter: an environment is TWO containers on a binder-enabled host — a privileged
// `redroid` running Android on the host kernel, and a companion node sharing its network namespace that
// drives the device over adb and presents a Selenium-node-compatible surface (Appium at `/session`, VNC at
// `/session/{id}/se/vnc`). The companion runs the same startup-fetched heartbeat agent as the browser
// nodes, so registration/liveness and log/video shipping are unchanged. provision is idempotent (any stale
// containers for the env id are removed first), so a reclaim retry never leaks a second pair. The endpoint
// is NOT written here — the agent reports it on registration; because a container cannot know its own
// published host port, the adapter reserves one, publishes the node on it, and injects the endpoint.
export class AndroidRedroidEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly docker: DockerClient,
        private readonly config: AndroidRedroidEnvironmentConfig,
    ) {
        super();
    }

    async provision(environment: Environment): Promise<void> {
        await this.removeByEnvironmentId(environment.id);

        const [application] = environment.applications.toArray();

        if (!application) {
            throw new InvalidArgumentError("environment: at least one application is required");
        }

        const hostPort = await reserveFreePort();
        const endpoint = `http://${this.config.advertiseHost}:${hostPort}`;
        const redroidName = `sw-redroid-${environment.id}`;

        // Android on the host kernel. It owns the shared network namespace, so it publishes the companion's
        // node port and carries the host-gateway alias the companion's agent uses for its callback.
        await this.docker.run({
            image: this.config.redroidImage(application),
            name: redroidName,
            privileged: true,
            publish: { host: hostPort, container: this.config.nodePort },
            addHost: { "host.docker.internal": "host-gateway" },
            command: [
                `androidboot.redroid_width=${this.config.screenWidth}`,
                `androidboot.redroid_height=${this.config.screenHeight}`,
                `androidboot.redroid_dpi=${this.config.dpi}`,
            ],
            labels: this.labels(environment),
        });

        // Companion node: shares redroid's netns (so localhost:5555 is the device's adb), drives it, and
        // serves the WebDriver + VNC surface. Same agent bootstrap as browser nodes; the agent execs the
        // node's start script as PID 1.
        await this.docker.run({
            image: this.config.nodeImage,
            name: `sw-node-${environment.id}`,
            network: `container:${redroidName}`,
            entrypoint: "bash",
            command: ["-c", agentBootstrap(this.config.entrypoint)],
            env: {
                SW_ENVIRONMENT_ID: environment.id,
                SW_ENDPOINT: endpoint,
                SW_INTERNAL_URL: this.config.internalUrl,
                SW_INTERNAL_SECRET: this.config.internalSecret,
                SW_SESSION_LOG_GLOB: sessionLogFile,
                REDROID_ADDR: "127.0.0.1:5555",
                // The agent records video by grabbing this X display (where scrcpy mirrors the device); keep
                // ffmpeg and scrcpy/Xvfb agreed on the geometry.
                SE_SCREEN_WIDTH: String(this.config.screenWidth),
                SE_SCREEN_HEIGHT: String(this.config.screenHeight),
            },
            labels: this.labels(environment),
        });
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.removeByEnvironmentId(environment.id);
    }

    private labels(environment: Environment): Record<string, string> {
        return {
            [dockerLabels.provider]: androidRedroidProviderValue,
            [dockerLabels.environmentId]: environment.id,
            [dockerLabels.accountId]: environment.accountId.getValue(),
        };
    }

    // Both containers of the environment carry its id label, so this removes the pair.
    private async removeByEnvironmentId(environmentId: string): Promise<void> {
        const containerIds = await this.docker.listByLabel(dockerLabels.environmentId, environmentId);

        await Promise.all(containerIds.map((containerId) => this.docker.remove(containerId).catch(() => undefined)));
    }
}
