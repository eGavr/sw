export type BrowserVmEnvironmentConfig = {
    // The prebaked golden image every browser VM is created from (docker + the prebaked selenium node
    // image + the boot unit). See images/linux-node.
    imageId: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    // The selenium node image the VM boots (a ref the golden has prebaked or can pull from our registry);
    // docker hub is not reachable from the RU VMs, so this is a CR ref.
    nodeImage: string;
    // Delegated to the node as SE_NODE_SESSION_TIMEOUT (the one domain idle-timeout policy).
    sessionTimeoutSeconds: number;
    // Base URL the in-VM agent calls back on (its per-env token is minted separately).
    internalUrl: string;
};

// A single Chrome session wants a couple of vCPUs and a few GB of RAM; the disk holds the golden's docker
// cache (selenium image ~1.5GB) with headroom.
export const defaultBrowserCores = 2;
export const defaultBrowserMemoryGb = 4;
export const defaultBrowserDiskGb = 30;
