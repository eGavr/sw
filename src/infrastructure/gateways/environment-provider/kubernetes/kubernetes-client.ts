import { spawn } from "child_process";

import { Injectable } from "@nestjs/common";

// Thin wrapper around the `kubectl` CLI, mirroring DockerClient: operational verbs live here, inside
// the backend client; the gateway builds domain-meaningful manifests and asks this to apply/delete them.
@Injectable()
export class KubernetesClient {
    constructor(
        private readonly namespace: string,
        private readonly context?: string,
    ) {}

    async apply(manifest: string): Promise<void> {
        await this.exec(["apply", "-f", "-"], manifest);
    }

    async deleteByLabel(label: string, value: string): Promise<void> {
        await this.exec(["delete", "pod,service", "-l", `${label}=${value}`, "--ignore-not-found", "--wait=false"]);
    }

    async listNodePorts(selector: string): Promise<Array<number>> {
        const stdout = await this.exec([
            "get", "service", "-l", selector, "-o", "jsonpath={.items[*].spec.ports[*].nodePort}",
        ]);

        return stdout.split(/\s+/).map((value) => Number(value)).filter((port) => Number.isInteger(port) && port > 0);
    }

    private exec(args: Array<string>, stdin?: string): Promise<string> {
        const scoped = ["-n", this.namespace, ...args];
        const full = this.context ? ["--context", this.context, ...scoped] : scoped;

        return new Promise((resolve, reject) => {
            const child = spawn("kubectl", full, { stdio: ["pipe", "pipe", "pipe"] });
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
}
