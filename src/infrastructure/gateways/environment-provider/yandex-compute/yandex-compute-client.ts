import { execFile } from "child_process";
import { promisify } from "util";

import { Injectable } from "@nestjs/common";

const execFileAsync = promisify(execFile);

export type YandexComputeInstanceOptions = {
    name: string;
    imageId: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    metadata: Record<string, string>;
};

// Thin wrapper around the `yc` CLI (the same shell-out pattern as DockerClient/KubernetesClient). It runs
// the operational verbs against YC Compute; the environment data the control plane needs comes back via the
// agent, not from here. Auth is ambient: `yc` uses the profile / the instance service account of whatever
// runs the worker.
@Injectable()
export class YandexComputeClient {
    async createInstance(options: YandexComputeInstanceOptions): Promise<void> {
        const metadata = Object.entries(options.metadata).map(([key, value]) => `${key}=${value}`).join(",");
        const networkInterface = options.securityGroupId
            ? `subnet-id=${options.subnetId},nat-ip-version=ipv4,security-group-ids=${options.securityGroupId}`
            : `subnet-id=${options.subnetId},nat-ip-version=ipv4`;

        // --async: our lifecycle is async — provision returns as soon as YC accepts the create; the VM boots
        // itself and the agent flips the environment to executing on its first heartbeat. An instance already
        // existing for this env id (a reaper retry over a still-booting VM) is treated as success, so
        // provision is idempotent — the same rule the Docker adapter gets from remove-before-run.
        try {
            await this.exec([
                "compute", "instance", "create",
                "--name", options.name,
                "--zone", options.zone,
                "--network-interface", networkInterface,
                "--create-boot-disk", `image-id=${options.imageId},size=${options.diskSizeGb},type=network-ssd`,
                "--cores", String(options.cores),
                "--memory", String(options.memoryGb),
                "--metadata", metadata,
                "--async",
            ]);
        } catch (error) {
            if (!this.isAlreadyExists(error)) {
                throw error;
            }
        }
    }

    private isAlreadyExists(error: unknown): boolean {
        return error instanceof Error && /already exists/i.test(error.message);
    }

    async deleteInstance(name: string): Promise<void> {
        // Idempotent: a missing instance (already gone / never created) is not an error for deprovision.
        await this.exec(["compute", "instance", "delete", "--name", name, "--async"]).catch(() => undefined);
    }

    private async exec(args: Array<string>): Promise<string> {
        const { stdout } = await execFileAsync("yc", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

        return stdout;
    }
}
