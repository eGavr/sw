import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../../domain/entities/account/account-id";
import { ApplicationData } from "../../../../domain/entities/environment/application/application";
import { ApplicationList } from "../../../../domain/entities/environment/application/application-list";
import { Environment, EnvironmentData } from "../../../../domain/entities/environment/environment";
import { Platform } from "../../../../domain/entities/environment/platform/platform";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";
import { CreateEnvironmentInput, EnvironmentDataSource } from "../environment-data-source";

import { DockerClient, DockerContainer } from "./docker-client";
import { dockerLabels, dockerProviderValue } from "./labels";

export type DockerProvisioning = {
    image: string;
    env?: Record<string, string>;
};

export type DockerEnvironmentConfig = {
    resolve: (application: ApplicationData) => DockerProvisioning;
    internalPort: number;
    sessionTimeoutSeconds: number;
    platform?: string;
};

export type BuildDockerEnvironmentConfigOptions = {
    image?: string;
    baseImage?: string;
    internalPort: number;
    sessionTimeoutSeconds: number;
    platform?: string;
};

export const defaultInternalPort = 4444;

// Idle timeout the browser node enforces per session: it kills a session that receives no command
// within this window and resets it on every command — the "smart" idle timeout, delegated to the node.
export const defaultSessionTimeoutSeconds = 300;

// Prebuilt strategy: the browser is baked into the image tag. `image` is a fixed tag or a template
// with `{version}`; without it, falls back to the amd64 selenium images keyed by version.
function prebuiltResolver(image: string | undefined): DockerEnvironmentConfig["resolve"] {
    return (application) => ({
        image: image
            ? (image.includes("{version}") ? image.replace("{version}", application.version) : image)
            : `selenium/standalone-chrome:${application.version}`,
    });
}

// Install strategy: a custom base image that installs the requested browser at startup, reading its
// name and version from these env vars — the base image's entrypoint contract.
function installResolver(baseImage: string): DockerEnvironmentConfig["resolve"] {
    return (application) => ({
        image: baseImage,
        env: {
            SW_BROWSER_NAME: application.name,
            SW_BROWSER_VERSION: application.version,
        },
    });
}

export function buildDockerEnvironmentConfig(options: BuildDockerEnvironmentConfigOptions): DockerEnvironmentConfig {
    return {
        resolve: options.baseImage ? installResolver(options.baseImage) : prebuiltResolver(options.image),
        internalPort: options.internalPort,
        sessionTimeoutSeconds: options.sessionTimeoutSeconds,
        platform: options.platform,
    };
}

// Docker-backed compute: an environment is a container that exposes a WebDriver endpoint. The
// container labels carry the full EnvironmentData so the provider stays the source of truth for
// live state; the endpoint is read from the port map.
@Injectable()
export class DockerEnvironmentDataSource extends EnvironmentDataSource {
    constructor(
        private readonly docker: DockerClient,
        private readonly config: DockerEnvironmentConfig = buildDockerEnvironmentConfig({
            internalPort: defaultInternalPort,
            sessionTimeoutSeconds: defaultSessionTimeoutSeconds,
        }),
    ) {
        super();
    }

    async create(input: CreateEnvironmentInput): Promise<EnvironmentData> {
        const [primary] = input.applications;

        if (!primary) {
            throw new InvalidArgumentError("environment: at least one application is required");
        }

        const environment = Environment.create({
            accountId: AccountId.fromString(input.accountId),
            platform: Platform.fromObject(input.platform),
            applications: ApplicationList.fromObject(input.applications),
        });
        const data = environment.toObject();
        const provisioning = this.config.resolve(primary);

        const containerId = await this.docker.run({
            image: provisioning.image,
            platform: this.config.platform,
            publishPort: this.config.internalPort,
            shmSize: "2g",
            env: {
                // Delegate the smart idle timeout and the "one active session" invariant to the browser node.
                SE_NODE_SESSION_TIMEOUT: String(this.config.sessionTimeoutSeconds),
                SE_NODE_MAX_SESSIONS: "1",
                SE_NODE_OVERRIDE_MAX_SESSIONS: "true",
                ...provisioning.env,
            },
            labels: {
                [dockerLabels.provider]: dockerProviderValue,
                [dockerLabels.environmentId]: data.id,
                [dockerLabels.accountId]: data.accountId,
                [dockerLabels.data]: this.encode(data),
            },
        });

        return this.toEnvironmentData(await this.docker.inspect(containerId));
    }

    async get(id: string): Promise<EnvironmentData | null> {
        const [containerId] = await this.docker.listByLabel(dockerLabels.environmentId, id);

        if (!containerId) {
            return null;
        }

        return this.toEnvironmentData(await this.docker.inspect(containerId));
    }

    async listByAccount(accountId: string): Promise<Array<EnvironmentData>> {
        const containerIds = await this.docker.listByLabel(dockerLabels.accountId, accountId);
        const containers = await Promise.all(containerIds.map((containerId) => this.docker.inspect(containerId)));

        return containers
            .filter((container) => container.labels[dockerLabels.provider] === dockerProviderValue)
            .map((container) => this.toEnvironmentData(container));
    }

    async delete(id: string): Promise<void> {
        const [containerId] = await this.docker.listByLabel(dockerLabels.environmentId, id);

        if (containerId) {
            await this.docker.remove(containerId);
        }
    }

    private encode(data: EnvironmentData): string {
        return Buffer.from(JSON.stringify(data)).toString("base64");
    }

    private toEnvironmentData(container: DockerContainer): EnvironmentData {
        const data = JSON.parse(Buffer.from(container.labels[dockerLabels.data], "base64").toString("utf8")) as EnvironmentData;
        const hostPort = container.ports[`${this.config.internalPort}/tcp`] ?? null;

        return {
            ...data,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
            lastHeartbeatAt: data.lastHeartbeatAt ? new Date(data.lastHeartbeatAt) : null,
            endpoint: hostPort ? `http://127.0.0.1:${hostPort}` : null,
        };
    }
}
