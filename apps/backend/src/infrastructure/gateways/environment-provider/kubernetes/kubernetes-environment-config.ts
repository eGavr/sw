// How the control plane reaches the environment pods and the cluster API.
//   pod-ip   — the pod's own VPC IP is the endpoint and the master's internal endpoint is used; works
//              when the control plane sits in the SAME VPC network as the cluster.
//   nodeport — a NodePort Service publishes the node on a host port and the node's PUBLIC ip is the
//              endpoint; the master's public endpoint is used. This is the delegated-BYOC case: the
//              user's cluster lives in their own folder/network, unreachable by pod IP, so everything
//              goes over public addresses (and the pod calls back to the control plane's public API).
export type KubernetesNetworking = "pod-ip" | "nodeport";

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
    // Base URL the in-pod agent calls back on (its per-env token is minted separately). For nodeport this
    // must be the control plane's PUBLIC address — the pod reaches it over the internet.
    internalUrl: string;
    // How pods and the cluster API are reached (see KubernetesNetworking).
    networking: KubernetesNetworking;
    // NodePort mode only: the host-port range NodePort Services are published on (the cluster's configured
    // service-node-port-range). A query bound, not a business threshold.
    nodePortRange: { min: number; max: number };
    // The port the selenium node listens on inside the pod.
    containerPort: number;
    // NodePort mode only: the public host a NodePort is reached on. A NodePort routes to the pod from ANY
    // node, so one stable node address is enough. Set explicitly so the delegated identity needs only the
    // namespaced cluster-api role (no cluster-scoped node read); empty falls back to querying a node.
    advertiseHost?: string;
};

export const defaultKubernetesNamespace = "default";
export const defaultCpuRequest = "1";
export const defaultMemoryRequest = "2Gi";
export const defaultCpuLimit = "2";
export const defaultMemoryLimit = "3Gi";
export const defaultKubernetesNetworking: KubernetesNetworking = "pod-ip";
export const defaultNodePortRange = { min: 30000, max: 32767 };
export const defaultKubernetesContainerPort = 4444;

// The raw values the composition root reads from COMPUTE_K8S_* env; the builder normalises them (networking
// mode, node-port range, container port) so that backend-specific shaping stays in the backend's folder,
// not in the shared provider — mirroring build*EnvironmentConfig for the android backends.
export type BuildKubernetesEnvironmentConfigOptions = {
    nodeImage: string;
    namespace?: string;
    entrypoint: string;
    cpuRequest?: string;
    memoryRequest?: string;
    cpuLimit?: string;
    memoryLimit?: string;
    sessionTimeoutSeconds: number;
    internalUrl: string;
    networking?: string;
    nodePortMin?: string;
    nodePortMax?: string;
    containerPort?: string;
    advertiseHost?: string;
};

export function buildKubernetesEnvironmentConfig(
    options: BuildKubernetesEnvironmentConfigOptions,
): KubernetesEnvironmentConfig {
    return {
        nodeImage: options.nodeImage,
        namespace: options.namespace || defaultKubernetesNamespace,
        entrypoint: options.entrypoint,
        cpuRequest: options.cpuRequest || defaultCpuRequest,
        memoryRequest: options.memoryRequest || defaultMemoryRequest,
        cpuLimit: options.cpuLimit || defaultCpuLimit,
        memoryLimit: options.memoryLimit || defaultMemoryLimit,
        sessionTimeoutSeconds: options.sessionTimeoutSeconds,
        internalUrl: options.internalUrl,
        networking: options.networking === "nodeport" ? "nodeport" : defaultKubernetesNetworking,
        nodePortRange: {
            min: options.nodePortMin ? Number(options.nodePortMin) : defaultNodePortRange.min,
            max: options.nodePortMax ? Number(options.nodePortMax) : defaultNodePortRange.max,
        },
        containerPort: options.containerPort ? Number(options.containerPort) : defaultKubernetesContainerPort,
        advertiseHost: options.advertiseHost || undefined,
    };
}
