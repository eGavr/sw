import { Injectable } from "@nestjs/common";

import { AccountId } from "../../../../domain/entities/account/account-id";
import { ApplicationData } from "../../../../domain/entities/environment/application/application";
import { ApplicationList } from "../../../../domain/entities/environment/application/application-list";
import { Environment, EnvironmentData } from "../../../../domain/entities/environment/environment";
import { Platform } from "../../../../domain/entities/environment/platform/platform";
import { EnvironmentProviderName } from "../../../../domain/entities/environment/provider/environment-provider-name";
import { InvalidArgumentError } from "../../../../domain/entities/error/invalid-argument-error";
import { CreateEnvironmentInput, EnvironmentDataSource } from "../environment-data-source";

import { DockerClient, DockerContainer } from "./docker-client";
import { dockerLabels, dockerProviderValue } from "./labels";

export type DockerEnvironmentConfig = {
    resolveImage: (application: ApplicationData) => string;
    internalPort: number;
    command?: Array<string>;
};

export const defaultInternalPort = 4444;

const resolveSeleniumImage = (application: ApplicationData): string => `selenium/standalone-chrome:${application.version}`;

// Builds the compute config from installation settings. `image` may be a fixed tag (e.g. the
// arm64 `seleniarm/standalone-chromium:latest`) or a template containing `{version}`, which is
// replaced with the requested application version. Falls back to the amd64 selenium images.
export function buildDockerEnvironmentConfig(image: string | undefined, internalPort: number): DockerEnvironmentConfig {
    if (!image) {
        return { resolveImage: resolveSeleniumImage, internalPort };
    }

    const resolveImage = (application: ApplicationData): string =>
        (image.includes("{version}") ? image.replace("{version}", application.version) : image);

    return { resolveImage, internalPort };
}

// Docker-backed compute: an environment is a container of a prebuilt image that exposes
// a WebDriver endpoint. The container labels carry the full EnvironmentData so the
// provider stays the source of truth for live state; the endpoint is read from the port map.
@Injectable()
export class DockerEnvironmentDataSource extends EnvironmentDataSource {
    constructor(
        private readonly docker: DockerClient,
        private readonly config: DockerEnvironmentConfig = { resolveImage: resolveSeleniumImage, internalPort: defaultInternalPort },
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
            providerName: EnvironmentProviderName.Docker,
            platform: Platform.fromObject(input.platform),
            applications: ApplicationList.fromObject(input.applications),
        });
        const data = environment.toObject();

        const containerId = await this.docker.run({
            image: this.config.resolveImage(primary),
            command: this.config.command,
            publishPort: this.config.internalPort,
            shmSize: "2g",
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
            endpoint: hostPort ? `http://127.0.0.1:${hostPort}` : null,
        };
    }
}
