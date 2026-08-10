import { execFile } from "child_process";
import { promisify } from "util";

import { Injectable } from "@nestjs/common";

const execFileAsync = promisify(execFile);

export type DockerPortMapping = {
    host: number;
    container: number;
};

export type DockerRunOptions = {
    image: string;
    labels: Record<string, string>;
    publish: DockerPortMapping;
    entrypoint?: string;
    command?: Array<string>;
    shmSize?: string;
    env?: Record<string, string>;
    platform?: string;
};

// Thin wrapper around the `docker` CLI. Operational verbs (run/remove) live here,
// inside the backend client; the data source exposes only storage-semantic methods.
@Injectable()
export class DockerClient {
    async run(options: DockerRunOptions): Promise<string> {
        // --rm so a container that exits on its own (a crash, or the agent self-fencing when the
        // backend no longer knows the environment) removes itself, with no control-plane cleanup.
        const args = ["run", "-d", "--rm"];

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

        if (options.entrypoint) {
            args.push("--entrypoint", options.entrypoint);
        }

        args.push("--publish", `${options.publish.host}:${options.publish.container}`, options.image);

        if (options.command) {
            args.push(...options.command);
        }

        return (await this.exec(args)).trim();
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
