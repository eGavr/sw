export type KubernetesEnvironmentConfig = {
    image: string;
    // The WebDriver port the browser node listens on inside the pod.
    containerPort: number;
    sessionTimeoutSeconds: number;
    // Host-reachable node-port range (mapped to the host by the cluster) to publish environments on.
    nodePortRange: { min: number; max: number };
    // Host address the node is reachable at (used to build SW_ENDPOINT for the in-pod agent).
    advertiseHost: string;
    // Base URL the in-pod agent calls back on, and the shared secret it authenticates with.
    internalUrl: string;
    internalSecret: string;
    // kubectl context to target; when unset the current context is used.
    context?: string;
};

export const defaultContainerPort = 4444;

export const defaultSessionTimeoutSeconds = 300;

export const defaultNodePortRange = { min: 30000, max: 30005 };
