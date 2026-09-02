export type KubernetesEnvironmentConfig = {
    // The selenium node image pods run (a CR ref — docker hub is not reachable from the RU nodes).
    nodeImage: string;
    // Namespace the environment pods live in (must exist in the user's cluster).
    namespace: string;
    // The image's normal entrypoint, exec'd by the agent bootstrap.
    entrypoint: string;
    // Requests drive packing (environments per node); limits cap a noisy session.
    cpuRequest: string;
    memoryRequest: string;
    cpuLimit: string;
    memoryLimit: string;
    // Delegated to the node as SE_NODE_SESSION_TIMEOUT (the one domain idle-timeout policy).
    sessionTimeoutSeconds: number;
    // Base URL the in-pod agent calls back on (its per-env token is minted separately).
    internalUrl: string;
};

export const defaultKubernetesNamespace = "default";
export const defaultCpuRequest = "1";
export const defaultMemoryRequest = "2Gi";
export const defaultCpuLimit = "2";
export const defaultMemoryLimit = "3Gi";
