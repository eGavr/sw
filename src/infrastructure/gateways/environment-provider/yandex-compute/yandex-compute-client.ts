import { execFile } from "child_process";
import { promisify } from "util";

import { Injectable } from "@nestjs/common";

const execFileAsync = promisify(execFile);

const metadataTokenUrl =
    "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token";

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
// agent, not from here. Auth: in-cluster it takes the node service account's IAM token from the instance
// metadata service and passes it as YC_TOKEN (kept out of argv/ps); locally it falls back to the ambient
// `yc` profile. The folder is passed explicitly because a token-authenticated call has no profile default.
@Injectable()
export class YandexComputeClient {
    constructor(private readonly folderId?: string) {}

    async createInstance(options: YandexComputeInstanceOptions): Promise<void> {
        const metadata = Object.entries(options.metadata).map(([key, value]) => `${key}=${value}`).join(",");
        // Internal-only: no NAT/public IP. The env VM is reached by wd within the VPC and calls the control
        // plane back via the internal load balancer, so a public IP is unnecessary (and would need
        // vpc.publicAdmin plus a scarce external address).
        const networkInterface = options.securityGroupId
            ? `subnet-id=${options.subnetId},security-group-ids=${options.securityGroupId}`
            : `subnet-id=${options.subnetId}`;

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

    async deleteInstance(name: string): Promise<void> {
        // Idempotent: a missing instance (already gone / never created) is not an error for deprovision.
        await this.exec(["compute", "instance", "delete", "--name", name, "--async"]).catch(() => undefined);
    }

    private async exec(args: Array<string>): Promise<string> {
        const folderArgs = this.folderId ? ["--folder-id", this.folderId] : [];
        const token = await this.metadataToken();
        const env = token ? { ...process.env, YC_TOKEN: token } : process.env;

        const { stdout } = await execFileAsync("yc", [...folderArgs, ...args], {
            env,
            encoding: "utf8",
            maxBuffer: 16 * 1024 * 1024,
        });

        return stdout;
    }

    // The node service account's IAM token from the instance metadata service; null off-cluster (where the
    // ambient `yc` profile authenticates instead).
    private async metadataToken(): Promise<string | null> {
        try {
            const response = await fetch(metadataTokenUrl, {
                headers: { "Metadata-Flavor": "Google" },
                signal: AbortSignal.timeout(3000),
            });

            if (!response.ok) {
                return null;
            }

            const body = await response.json() as { access_token?: string };

            return body.access_token ?? null;
        } catch {
            return null;
        }
    }

    private isAlreadyExists(error: unknown): boolean {
        if (!(error instanceof Error)) {
            return false;
        }

        // execFile puts the CLI's stderr on `.stderr`, not `.message` (which is just "Command failed: …"),
        // so the "already exists" text lives there.
        const stderr = (error as { stderr?: string }).stderr ?? "";

        return /already exists/i.test(error.message) || /already exists/i.test(stderr);
    }
}
