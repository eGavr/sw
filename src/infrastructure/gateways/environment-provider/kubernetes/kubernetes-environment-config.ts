export type ResourceQuantities = {
    cpu: string;
    memory: string;
};

export type KubernetesEnvironmentConfig = {
    image: string;
    // Namespace the environment pods/services live in (isolated from the control plane).
    namespace: string;
    // The WebDriver port the browser node listens on inside the pod.
    containerPort: number;
    sessionTimeoutSeconds: number;
    // Host-reachable node-port range (mapped to the host by the cluster) to publish environments on.
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

export const defaultContainerPort = 4444;

export const defaultSessionTimeoutSeconds = 300;

export const defaultNodePortRange = { min: 30000, max: 30005 };

export const defaultResources = {
    requests: { cpu: "500m", memory: "1Gi" },
    limits: { cpu: "2", memory: "2Gi" },
};
