import { execFile } from "child_process";
import { promisify } from "util";

import { Injectable } from "@nestjs/common";

const execFileAsync = promisify(execFile);

export type DockerRunOptions = {
    image: string;
    labels: Record<string, string>;
    publishPort: number;
    command?: Array<string>;
    shmSize?: string;
    env?: Record<string, string>;
    platform?: string;
};

export type DockerContainer = {
    id: string;
    labels: Record<string, string>;
    createdAt: string;
    running: boolean;
    ports: Record<string, string | null>;
};

type RawPortBinding = {
    HostPort?: string;
};

type RawInspect = {
    Id: string;
    Created: string;
    Config?: {
        Labels?: Record<string, string> | null;
    };
    State?: {
        Running?: boolean;
    };
    NetworkSettings?: {
        Ports?: Record<string, Array<RawPortBinding> | null> | null;
    };
};

// Thin wrapper around the `docker` CLI. Operational verbs (run/remove) live here,
// inside the backend client; the data source exposes only storage-semantic methods.
@Injectable()
export class DockerClient {
    async run(options: DockerRunOptions): Promise<string> {
        const args = ["run", "-d"];

        if (options.platform) {
            args.push("--platform", options.platform);
        }

        for (const [key, value] of Object.entries(options.labels)) {
            args.push("--label", `${key}=${value}`);
        }

        if (options.shmSize) {
            args.push("--shm-size", options.shmSize);
        }

        for (const [key, value] of Object.entries(options.env ?? {})) {
            args.push("--env", `${key}=${value}`);
        }

        args.push("--publish", `0:${options.publishPort}`, options.image);

        if (options.command) {
            args.push(...options.command);
        }

        return (await this.exec(args)).trim();
    }

    async inspect(containerId: string): Promise<DockerContainer> {
        const [raw] = JSON.parse(await this.exec(["inspect", containerId])) as Array<RawInspect>;
        const ports: Record<string, string | null> = {};

        for (const [port, bindings] of Object.entries(raw.NetworkSettings?.Ports ?? {})) {
            ports[port] = bindings?.[0]?.HostPort ?? null;
        }

        return {
            id: raw.Id,
            labels: raw.Config?.Labels ?? {},
            createdAt: raw.Created,
            running: raw.State?.Running ?? false,
            ports,
        };
    }

    async listByLabel(label: string, value: string): Promise<Array<string>> {
        const stdout = await this.exec(["ps", "-a", "--filter", `label=${label}=${value}`, "--format", "{{.ID}}"]);

        return stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    }

    async remove(containerId: string): Promise<void> {
        await this.exec(["rm", "-f", containerId]);
    }

    private async exec(args: Array<string>): Promise<string> {
        const { stdout } = await execFileAsync("docker", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

        return stdout;
    }
}
