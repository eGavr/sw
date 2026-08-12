export type ResourceQuantities = {
    cpu: string;
    memory: string;
};

// How an environment pod is published:
//  - "nodeport": a NodePort Service on a host-mapped port, endpoint http://<advertiseHost>:<nodePort>.
//    For local dev (kind + Docker Desktop) where the control plane runs on the host.
//  - "cluster-dns": a ClusterIP Service, endpoint http://<name>.<ns>.svc.cluster.local:<port>. For a
//    real cluster where the control plane runs in-cluster and reaches pods by service DNS.
export type KubernetesNetworking = "nodeport" | "cluster-dns";

export type KubernetesEnvironmentConfig = {
    image: string;
    // Namespace the environment pods/services live in (isolated from the control plane).
    namespace: string;
    networking: KubernetesNetworking;
    // The WebDriver port the browser node listens on inside the pod.
    containerPort: number;
    sessionTimeoutSeconds: number;
    // Image entrypoint the bootstrap execs after starting the agent (selenium base default).
    entrypoint: string;
    // Host-reachable node-port range (mapped to the host by the cluster), used by "nodeport" networking.
    nodePortRange: { min: number; max: number };
    // Scheduler requests and hard limits for the environment container (a browser needs real memory).
    resources: { requests: ResourceQuantities; limits: ResourceQuantities };
    // Host address the node is reachable at (used to build SW_ENDPOINT for the in-pod agent).
    advertiseHost: string;
    // Base URL the in-pod agent calls back on, and the shared secret it authenticates with.
    internalUrl: string;
    internalSecret: string;
    // kubectl context to target; when unset the current context is used.
    context?: string;
};

export const defaultNamespace = "sw-environments";

export const defaultNetworking: KubernetesNetworking = "nodeport";

export const defaultContainerPort = 4444;

export const defaultSessionTimeoutSeconds = 300;

export const defaultNodePortRange = { min: 30000, max: 30005 };

export const defaultResources = {
    requests: { cpu: "500m", memory: "1Gi" },
    limits: { cpu: "2", memory: "2Gi" },
};
