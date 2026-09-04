import { execFile } from "child_process";
import { promisify } from "util";

import { Injectable } from "@nestjs/common";

import { CloudReachability } from "../../../../application/interfaces/gateways/environment-provider-gateway";

const execFileAsync = promisify(execFile);

const metadataTokenUrl =
    "http://169.254.169.254/computeMetadata/v1/instance/service-projects/default/token";

export type BaremetalServerOptions = {
    name: string;
    folderId?: string;
    configurationId: string;
    zone: string;
    subnetId?: string;
    labels: Record<string, string>;
    userData: string;
};

// Thin wrapper around the `yc baremetal` CLI (the same shell-out pattern as YandexComputeClient —
// auth via the instance metadata IAM token in-cluster, the ambient `yc` profile off-cluster). The
// exact flag set is best-effort until verified against a real BareMetal order (S4 fact-check /
// live-verify): the CLI group and lease semantics are stable, the option names may need adjusting.
@Injectable()
export class YandexBaremetalClient {
    constructor(private readonly folderId?: string) {}

    async createServer(options: BaremetalServerOptions): Promise<void> {
        const labels = Object.entries(options.labels).map(([key, value]) => `${key}=${value}`).join(",");

        try {
            await this.exec([
                "baremetal", "server", "create",
                "--name", options.name,
                "--zone", options.zone,
                "--configuration-id", options.configurationId,
                ...(options.subnetId ? ["--subnet-id", options.subnetId] : []),
                "--labels", labels,
                "--metadata", `user-data=${options.userData}`,
                "--async",
            ], options.folderId);
        } catch (error) {
            // A server already leased under this name (a retry over a pending order) is success — the
            // same idempotence rule every provision path follows.
            if (!this.isAlreadyExists(error)) {
                throw error;
            }
        }
    }

    async deleteServer(name: string, folderId?: string): Promise<void> {
        // Idempotent: a missing server (already returned / never leased) is not an error.
        await this.exec(["baremetal", "server", "delete", "--name", name, "--async"], folderId)
            .catch(() => undefined);
    }

    // Same probe as the compute client: reading the target folder proves our delegated identity can
    // operate there. A failure is the answer, not an exception.
    async checkAccess(folderId?: string): Promise<CloudReachability> {
        const folder = folderId ?? this.folderId;
        const probe = folder
            ? ["resource-manager", "folder", "get", "--id", folder, "--format", "json"]
            : ["resource-manager", "cloud", "list", "--format", "json"];

        try {
            await this.run(probe);

            return { reachable: true };
        } catch (error) {
            const stderr = (error as { stderr?: string }).stderr;

            return { reachable: false, detail: stderr || (error instanceof Error ? error.message : String(error)) };
        }
    }

    // The folder's labels (read-only) — carries the per-project ownership marker only its owner could
    // have placed (resource-manager.viewer reads labels but cannot write them).
    async folderLabels(folderId: string): Promise<Record<string, string>> {
        const out = await this.run(["resource-manager", "folder", "get", "--id", folderId, "--format", "json"]);
        const parsed = JSON.parse(out) as { labels?: Record<string, string> };

        return parsed.labels ?? {};
    }

    private async exec(args: Array<string>, folderId?: string): Promise<string> {
        const folder = folderId ?? this.folderId;
        const folderArgs = folder ? ["--folder-id", folder] : [];

        return this.run([...folderArgs, ...args]);
    }

    private async run(args: Array<string>): Promise<string> {
        const token = await this.metadataToken();
        const env = token ? { ...process.env, YC_TOKEN: token } : process.env;

        const { stdout } = await execFileAsync("yc", args, {
            env,
            encoding: "utf8",
            maxBuffer: 16 * 1024 * 1024,
        });

        return stdout;
    }

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

        const stderr = (error as { stderr?: string }).stderr ?? "";

        return /already exists/i.test(error.message) || /already exists/i.test(stderr);
    }
}
