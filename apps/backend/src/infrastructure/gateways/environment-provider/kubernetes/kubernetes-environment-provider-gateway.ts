import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import {
    CloudReachability,
    EnvironmentProviderGateway,
} from "../../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../../domain/entities/cloud-account/cloud-account";
import { ComputeBinding } from "../../../../domain/entities/cloud-account/compute-binding";
import { Environment } from "../../../../domain/entities/environment/environment";
import { InternalError } from "../../../../domain/entities/error/internal-error";
import { agentBootstrap, sessionLogFile } from "../agent-bootstrap";

import { KubernetesClient } from "./kubernetes-client";
import { KubernetesEnvironmentConfig } from "./kubernetes-environment-config";

const labels = {
    provider: "sw.provider",
    environmentId: "sw.environment.id",
    projectId: "sw.project.id",
};

const providerValue = "kubernetes";

// Where the environment's WebDriver endpoint lives and how the Service publishes it.
type Endpoint =
    | { networking: "pod-ip"; url: string; service: null }
    | { networking: "nodeport"; url: string; service: { nodePort: number } };

// Kubernetes adapter (the fast-start compute kind): an environment is a Pod in the USER'S managed cluster
// — the binding's clusterId points at it, our identity was granted cluster access. The pod runs the stock
// selenium node with the heartbeat agent injected (agentBootstrap), byte-for-byte the docker/VM scheme.
// Two networking modes (see KubernetesNetworking): pod-ip advertises the pod's own VPC IP (control plane
// in the same network); nodeport publishes a NodePort on a public node and advertises node-ip:nodePort
// (delegated BYOC — the cluster is in the user's own folder, reachable only over public addresses). The
// endpoint is advertised by the in-pod agent on registration; provision is idempotent (stale pod+service
// for the env id are removed first); deprovision deletes both.
export class KubernetesEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(
        private readonly kubernetes: KubernetesClient,
        private readonly config: KubernetesEnvironmentConfig,
        private readonly agentTokens: AgentTokenService,
    ) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        const clusterId = this.clusterIdFor(environment, cloudAccount);

        await this.kubernetes.deleteByLabel(clusterId, labels.environmentId, environment.id);

        const endpoint = await this.resolveEndpoint(clusterId);
        const agentToken = await this.agentTokens.issue(environment.id);

        await this.kubernetes.apply(clusterId, JSON.stringify(this.manifest(environment, endpoint, agentToken)));
    }

    async deprovision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.kubernetes.deleteByLabel(
            this.clusterIdFor(environment, cloudAccount),
            labels.environmentId,
            environment.id,
        );
    }

    // Probes the binding's cluster: whether we may create pods in the namespace — a namespaced check the
    // delegated cluster-api role grants (no cluster-scoped read needed).
    async checkAccess(_cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability> {
        try {
            await this.kubernetes.ensureCanProvision(this.boundClusterId(binding), this.config.namespace);

            return { reachable: true };
        } catch (error) {
            return { reachable: false, detail: error instanceof Error ? error.message : String(error) };
        }
    }

    // In pod-ip mode the pod's own VPC IP (downward API) is the endpoint. In nodeport mode a NodePort is
    // reserved and a public node host is the endpoint. The host comes from config (advertiseHost) so the
    // delegated identity needs only the namespaced cluster-api role; a node is queried only as a fallback.
    private async resolveEndpoint(clusterId: string): Promise<Endpoint> {
        if (this.config.networking === "pod-ip") {
            return {
                networking: "pod-ip",
                url: `http://$(POD_IP):${this.config.containerPort}`,
                service: null,
            };
        }

        const host = this.config.advertiseHost ?? await this.kubernetes.nodeExternalIp(clusterId);
        const nodePort = await this.reserveNodePort(clusterId);

        return { networking: "nodeport", url: `http://${host}:${nodePort}`, service: { nodePort } };
    }

    // The lowest node-port in the configured range not already taken by a live sw Service. A full pool
    // fails the provision and the reaper retries — it is a query bound, not a business threshold.
    private async reserveNodePort(clusterId: string): Promise<number> {
        const used = new Set(await this.kubernetes.usedNodePorts(
            clusterId, this.config.namespace, `${labels.provider}=${providerValue}`,
        ));

        for (let port = this.config.nodePortRange.min; port <= this.config.nodePortRange.max; port++) {
            if (!used.has(port)) {
                return port;
            }
        }

        throw new InternalError("kubernetes: no free node port in the configured range");
    }

    // The cluster comes from the environment's substrate binding. A binding re-pointed away from
    // kubernetes while its environments still live cannot be torn down through it — a known limitation
    // until environments record their cluster.
    private clusterIdFor(environment: Environment, cloudAccount: CloudAccount | null): string {
        const binding = cloudAccount?.computeBindingFor(environment.platform.name, environment.execution);

        if (!binding || binding.kind !== providerValue) {
            throw new InternalError(
                `environment ${environment.id}: no kubernetes binding on its cloud account`,
            );
        }

        return this.boundClusterId(binding);
    }

    private boundClusterId(binding: ComputeBinding): string {
        const clusterId = binding.config["clusterId"];

        if (typeof clusterId !== "string" || clusterId === "") {
            throw new InternalError(`compute binding ${binding.id}: no clusterId configured`);
        }

        return clusterId;
    }

    private manifest(environment: Environment, endpoint: Endpoint, agentToken: string): object {
        const name = `sw-env-${environment.id}`;
        const metadataLabels = {
            [labels.provider]: providerValue,
            [labels.environmentId]: environment.id,
            [labels.projectId]: environment.projectId.getValue(),
        };
        const pod = {
            apiVersion: "v1",
            kind: "Pod",
            metadata: { name, namespace: this.config.namespace, labels: metadataLabels },
            spec: {
                restartPolicy: "Never",
                containers: [{
                    name: "node",
                    image: this.config.nodeImage,
                    imagePullPolicy: "IfNotPresent",
                    // Stock selenium image: fetch the agent at startup, then exec the node (PID 1).
                    command: ["bash", "-c", agentBootstrap(this.config.entrypoint)],
                    ports: [{ containerPort: this.config.containerPort }],
                    env: this.env(environment, endpoint.url, agentToken),
                    resources: {
                        requests: { cpu: this.config.cpuRequest, memory: this.config.memoryRequest },
                        limits: { cpu: this.config.cpuLimit, memory: this.config.memoryLimit },
                    },
                    volumeMounts: [{ name: "dshm", mountPath: "/dev/shm" }],
                }],
                volumes: [{ name: "dshm", emptyDir: { medium: "Memory", sizeLimit: "2Gi" } }],
            },
        };

        if (endpoint.networking === "pod-ip") {
            return pod;
        }

        return {
            apiVersion: "v1",
            kind: "List",
            items: [pod, {
                apiVersion: "v1",
                kind: "Service",
                metadata: { name, namespace: this.config.namespace, labels: metadataLabels },
                spec: {
                    type: "NodePort",
                    selector: { [labels.environmentId]: environment.id },
                    ports: [{
                        port: this.config.containerPort,
                        targetPort: this.config.containerPort,
                        nodePort: endpoint.service.nodePort,
                    }],
                },
            }],
        };
    }

    private env(environment: Environment, endpoint: string, agentToken: string): Array<object> {
        return [
            // pod-ip mode substitutes $(POD_IP) from the downward API; nodeport bakes a literal node ip.
            { name: "POD_IP", valueFrom: { fieldRef: { fieldPath: "status.podIP" } } },
            { name: "SW_ENDPOINT", value: endpoint },
            { name: "SW_ENVIRONMENT_ID", value: environment.id },
            { name: "SW_INTERNAL_URL", value: this.config.internalUrl },
            { name: "SW_INTERNAL_TOKEN", value: agentToken },
            // The bootstrap redirects the container's stdout here; the agent slices session logs from it.
            { name: "SW_SESSION_LOG_GLOB", value: sessionLogFile },
            // Delegate the smart idle timeout and the "one active session" invariant to the node.
            { name: "SE_NODE_SESSION_TIMEOUT", value: String(this.config.sessionTimeoutSeconds) },
            { name: "SE_NODE_MAX_SESSIONS", value: "1" },
            { name: "SE_NODE_OVERRIDE_MAX_SESSIONS", value: "true" },
        ];
    }
}
