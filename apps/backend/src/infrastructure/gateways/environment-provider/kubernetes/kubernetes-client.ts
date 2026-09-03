import { execFile, spawn } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Thin wrapper around the kubectl CLI, mirroring DockerClient: operational verbs live here, inside the
// backend client; the gateway builds domain-meaningful manifests and asks this to apply/delete them.
// Every call targets the USER'S managed cluster: the kubeconfig for a cluster id is materialised once per
// process via `yc managed-kubernetes cluster get-credentials` (auth = our ambient IAM identity, which the
// user granted on their cluster — delegation, no secrets of theirs). `external` selects the cluster's
// public master endpoint (cross-folder BYOC) vs the internal one (same VPC as the control plane).
export class KubernetesClient {
    private readonly kubeconfigs = new Map<string, Promise<string>>();

    constructor(private readonly external: boolean = false) {}

    async apply(clusterId: string, manifest: string): Promise<void> {
        await this.exec(clusterId, ["apply", "-f", "-"], manifest);
    }

    async deleteByLabel(clusterId: string, label: string, value: string): Promise<void> {
        await this.exec(clusterId, ["delete", "pod,service", "-l", `${label}=${value}`, "--ignore-not-found", "--wait=false"]);
    }

    // Reachability probe: whether we may create pods in the namespace — a NAMESPACED check the delegated
    // cluster-api role grants, so it exercises real provisioning access without needing cluster-scoped
    // reads. Throws (non-"yes") when access is missing.
    async ensureCanProvision(clusterId: string, namespace: string): Promise<void> {
        const answer = await this.exec(clusterId, ["auth", "can-i", "create", "pods", "-n", namespace]);

        if (answer.trim() !== "yes") {
            throw new Error(`kubernetes: cannot create pods in namespace ${namespace} (access not granted)`);
        }
    }

    // A node's public address — the host the control plane reaches a NodePort on. Any Ready node routes a
    // NodePort to the pod, so the first external address is enough.
    async nodeExternalIp(clusterId: string): Promise<string> {
        const out = await this.exec(clusterId, [
            "get", "nodes",
            "-o", "jsonpath={.items[*].status.addresses[?(@.type==\"ExternalIP\")].address}",
        ]);
        const [ip] = out.trim().split(/\s+/).filter(Boolean);

        if (!ip) {
            throw new Error("kubernetes: no node has an ExternalIP (nodeport networking needs public nodes)");
        }

        return ip;
    }

    // The managed cluster's labels (YC-level, read via the yc CLI + k8s.viewer). Setting a cluster label
    // needs k8s.editor, which we are NOT granted — so the per-project ownership marker among them can only
    // have been placed by the cluster's owner.
    async clusterLabels(clusterId: string): Promise<Record<string, string>> {
        const { stdout } = await execFileAsync("yc", [
            "managed-kubernetes", "cluster", "get", "--id", clusterId, "--format", "json",
        ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
        const parsed = JSON.parse(stdout) as { labels?: Record<string, string> };

        return parsed.labels ?? {};
    }

    // The node ports already taken by live sw Services in the namespace — so a fresh environment picks a
    // free one. Namespaced (no cluster-scoped read needed).
    async usedNodePorts(clusterId: string, namespace: string, label: string): Promise<Array<number>> {
        const out = await this.exec(clusterId, [
            "get", "services", "-n", namespace, "-l", label,
            "-o", "jsonpath={.items[*].spec.ports[*].nodePort}",
        ]);

        return out.trim().split(/\s+/).filter(Boolean).map(Number);
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
    // config embeds the yc exec-credential plugin, so tokens refresh themselves. `--external` for the
    // public master endpoint (cross-folder), else `--internal` (same VPC).
    private kubeconfigFor(clusterId: string): Promise<string> {
        const cached = this.kubeconfigs.get(clusterId);

        if (cached) {
            return cached;
        }

        const path = `/tmp/sw-kubeconfig-${clusterId}`;
        const materialised = execFileAsync("yc", [
            "managed-kubernetes", "cluster", "get-credentials", "--id", clusterId,
            this.external ? "--external" : "--internal", "--force", "--kubeconfig", path,
        ]).then(() => path);

        this.kubeconfigs.set(clusterId, materialised);
        materialised.catch(() => this.kubeconfigs.delete(clusterId));

        return materialised;
    }
}
