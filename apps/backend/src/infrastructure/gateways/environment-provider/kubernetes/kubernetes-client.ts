import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Thin wrapper around the kubectl CLI, mirroring DockerClient: operational verbs live here, inside the
// backend client; the gateway builds domain-meaningful manifests and asks this to apply/delete them.
// Every call targets the USER'S managed cluster: the kubeconfig for a cluster id is materialised once per
// process via `yc managed-kubernetes cluster get-credentials` (auth = our ambient IAM identity, which the
// user granted on their cluster — delegation, no secrets of theirs).
export class KubernetesClient {
    private readonly kubeconfigs = new Map<string, Promise<string>>();

    async apply(clusterId: string, manifest: string): Promise<void> {
        await this.exec(clusterId, ["apply", "-f", "-"], manifest);
    }

    async deleteByLabel(clusterId: string, label: string, value: string): Promise<void> {
        await this.exec(clusterId, ["delete", "pod", "-l", `${label}=${value}`, "--ignore-not-found", "--wait=false"]);
    }

    // Reachability probe: listing nodes exercises cluster API access end to end.
    async nodes(clusterId: string): Promise<void> {
        await this.exec(clusterId, ["get", "nodes", "-o", "name"]);
    }

    private async exec(clusterId: string, args: Array<string>, stdin?: string): Promise<string> {
        const kubeconfig = await this.kubeconfigFor(clusterId);

        return new Promise((resolve, reject) => {
            const child = spawn("kubectl", ["--kubeconfig", kubeconfig, ...args], { stdio: ["pipe", "pipe", "pipe"] });
            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (chunk) => { stdout += chunk; });
            child.stderr.on("data", (chunk) => { stderr += chunk; });
            child.on("error", reject);
            child.on("close", (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`kubectl ${args.join(" ")} failed (${code ?? "signal"}): ${stderr.trim()}`));
                }
            });

            if (stdin !== undefined) {
                child.stdin.write(stdin);
            }

            child.stdin.end();
        });
    }

    // One kubeconfig file per cluster per process; `--force` overwrites stale entries on restart. The
    // config embeds the yc exec-credential plugin, so tokens refresh themselves.
    private kubeconfigFor(clusterId: string): Promise<string> {
        const cached = this.kubeconfigs.get(clusterId);

        if (cached) {
            return cached;
        }

        const path = `/tmp/sw-kubeconfig-${clusterId}`;
        const materialised = execFileAsync("yc", [
            "managed-kubernetes", "cluster", "get-credentials", "--id", clusterId,
            "--internal", "--force", "--kubeconfig", path,
        ]).then(() => path);

        this.kubeconfigs.set(clusterId, materialised);
        materialised.catch(() => this.kubeconfigs.delete(clusterId));

        return materialised;
    }
}
