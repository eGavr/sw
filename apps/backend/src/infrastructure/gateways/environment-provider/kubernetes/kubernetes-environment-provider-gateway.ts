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
const nodePort = 4444;

// Kubernetes adapter (the fast-start compute kind): an environment is a Pod in the USER'S managed
// cluster — the binding's clusterId points at it, our identity was granted cluster access. The pod runs
// the stock selenium node with the heartbeat agent injected (agentBootstrap), byte-for-byte the docker/VM
// scheme. The endpoint is the pod's own IP (VPC-routable in managed k8s): injected via the downward API,
// advertised by the agent on registration. provision is idempotent (stale pods for the env id are removed
// first); deprovision deletes the pod.
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
        await this.kubernetes.apply(
            clusterId,
            JSON.stringify(this.manifest(environment, await this.agentTokens.issue(environment.id))),
        );
    }

    async deprovision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.kubernetes.deleteByLabel(
            this.clusterIdFor(environment, cloudAccount),
            labels.environmentId,
            environment.id,
        );
    }

    // Probes the binding's cluster: listing nodes exercises the granted cluster API access.
    async checkAccess(_cloudAccount: CloudAccount, binding: ComputeBinding): Promise<CloudReachability> {
        try {
            await this.kubernetes.nodes(this.boundClusterId(binding));

            return { reachable: true };
        } catch (error) {
            return { reachable: false, detail: error instanceof Error ? error.message : String(error) };
        }
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

    private manifest(environment: Environment, agentToken: string): object {
        return {
            apiVersion: "v1",
            kind: "Pod",
            metadata: {
                name: `sw-env-${environment.id}`,
                namespace: this.config.namespace,
                labels: {
                    [labels.provider]: providerValue,
                    [labels.environmentId]: environment.id,
                    [labels.projectId]: environment.projectId.getValue(),
                },
            },
            spec: {
                restartPolicy: "Never",
                containers: [{
                    name: "node",
                    image: this.config.nodeImage,
                    imagePullPolicy: "IfNotPresent",
                    // Stock selenium image: fetch the agent at startup, then exec the node (PID 1).
                    command: ["bash", "-c", agentBootstrap(this.config.entrypoint)],
                    ports: [{ containerPort: nodePort }],
                    env: this.env(environment, agentToken),
                    resources: {
                        requests: { cpu: this.config.cpuRequest, memory: this.config.memoryRequest },
                        limits: { cpu: this.config.cpuLimit, memory: this.config.memoryLimit },
                    },
                    volumeMounts: [{ name: "dshm", mountPath: "/dev/shm" }],
                }],
                volumes: [{ name: "dshm", emptyDir: { medium: "Memory", sizeLimit: "2Gi" } }],
            },
        };
    }

    private env(environment: Environment, agentToken: string): Array<object> {
        return [
            // The pod's own VPC-routable IP, resolved by the downward API — the endpoint the agent
            // advertises on registration (kubernetes substitutes $(POD_IP) below).
            { name: "POD_IP", valueFrom: { fieldRef: { fieldPath: "status.podIP" } } },
            { name: "SW_ENDPOINT", value: `http://$(POD_IP):${nodePort}` },
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
