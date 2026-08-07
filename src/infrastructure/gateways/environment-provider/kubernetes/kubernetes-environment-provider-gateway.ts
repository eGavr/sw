import { EnvironmentProviderGateway } from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { Environment } from "../../../../domain/entities/environment/environment";

import { KubernetesClient } from "./kubernetes-client";
import { KubernetesEnvironmentConfig } from "./kubernetes-environment-config";

const labels = {
    provider: "sw.provider",
    environmentId: "sw.environment.id",
    accountId: "sw.account.id",
};

const providerValue = "kubernetes";

// Kubernetes adapter: an environment is a Pod exposing a WebDriver endpoint plus a NodePort Service
// that publishes it on a host-reachable port (the cluster maps the node-port range to the host, like a
// Docker published port). provision is idempotent — any Pod/Service for the env id is removed before a
// fresh apply — so a reclaim retry never leaks a second one. The endpoint is NOT written here: the
// in-pod agent reports it on registration; this only injects the resolved endpoint + callback URL/secret.
export class KubernetesEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly kubernetes: KubernetesClient,
        private readonly config: KubernetesEnvironmentConfig,
    ) {
        super();
    }

    async provision(environment: Environment): Promise<void> {
        await this.kubernetes.deleteByLabel(labels.environmentId, environment.id);

        const nodePort = await this.reserveNodePort();
        const endpoint = `http://${this.config.advertiseHost}:${nodePort}`;

        await this.kubernetes.apply(JSON.stringify(this.manifest(environment, nodePort, endpoint)));
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.kubernetes.deleteByLabel(labels.environmentId, environment.id);
    }

    // Pick the lowest node-port in the configured range not already taken by a live sw Service. The pool
    // is a query bound (host-mapped ports), not a business threshold; a full pool fails the provision and
    // the reaper retries.
    private async reserveNodePort(): Promise<number> {
        const used = new Set(await this.kubernetes.listNodePorts(`${labels.provider}=${providerValue}`));

        for (let port = this.config.nodePortRange.min; port <= this.config.nodePortRange.max; port++) {
            if (!used.has(port)) {
                return port;
            }
        }

        throw new Error("kubernetes: no free node port in the configured range");
    }

    private manifest(environment: Environment, nodePort: number, endpoint: string): object {
        const name = `sw-env-${environment.id}`;
        const selector = { [labels.environmentId]: environment.id };
        const metadataLabels = {
            [labels.provider]: providerValue,
            [labels.environmentId]: environment.id,
            [labels.accountId]: environment.accountId.getValue(),
        };

        const namespace = this.config.namespace;

        return {
            apiVersion: "v1",
            kind: "List",
            items: [
                {
                    apiVersion: "v1",
                    kind: "Pod",
                    metadata: { name, namespace, labels: metadataLabels },
                    spec: {
                        restartPolicy: "Never",
                        containers: [{
                            name: "node",
                            image: this.config.image,
                            // The image is loaded into the cluster, not pulled from a registry; without
                            // this a `:latest` tag defaults to Always and fails with ErrImagePull.
                            imagePullPolicy: "IfNotPresent",
                            ports: [{ containerPort: this.config.containerPort }],
                            env: this.env(environment, endpoint),
                            resources: this.config.resources,
                            volumeMounts: [{ name: "dshm", mountPath: "/dev/shm" }],
                        }],
                        volumes: [{ name: "dshm", emptyDir: { medium: "Memory", sizeLimit: "2Gi" } }],
                    },
                },
                {
                    apiVersion: "v1",
                    kind: "Service",
                    metadata: { name, namespace, labels: metadataLabels },
                    spec: {
                        type: "NodePort",
                        selector,
                        ports: [{ port: this.config.containerPort, targetPort: this.config.containerPort, nodePort }],
                    },
                },
            ],
        };
    }

    private env(environment: Environment, endpoint: string): Array<{ name: string; value: string }> {
        return Object.entries({
            SW_ENVIRONMENT_ID: environment.id,
            SW_ENDPOINT: endpoint,
            SW_INTERNAL_URL: this.config.internalUrl,
            SW_INTERNAL_SECRET: this.config.internalSecret,
            // Delegate the smart idle timeout and the "one active session" invariant to the node.
            SE_NODE_SESSION_TIMEOUT: String(this.config.sessionTimeoutSeconds),
            SE_NODE_MAX_SESSIONS: "1",
            SE_NODE_OVERRIDE_MAX_SESSIONS: "true",
        }).map(([name, value]) => ({ name, value }));
    }
}
