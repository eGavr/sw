import { ScreenGeometry } from "../linux-node";

export type BrowserVmEnvironmentConfig = {
    // The prebaked golden image every browser VM is created from (docker + the prebaked linux base image
    // + the boot unit). See images/linux-node.
    imageId: string;
    zone: string;
    subnetId: string;
    securityGroupId?: string;
    cores: number;
    memoryGb: number;
    diskSizeGb: number;
    // The linux base image template the VM's docker runs, `{version}` standing for the platform version
    // (a ref the golden has prebaked or can pull from our registry; docker hub is not reachable from
    // the RU VMs).
    baseImage: string;
    // The session idle timeout the node's wd door enforces (the one domain idle-timeout policy).
    sessionTimeoutSeconds: number;
    // The headless display the browser renders on (also the video record size).
    screen: ScreenGeometry;
    // Base URL the in-VM agent calls back on (its per-env token is minted separately).
    internalUrl: string;
};

// A single Chrome session wants a couple of vCPUs and a few GB of RAM; the disk holds the golden's docker
// cache (the base image ~1GB) with headroom for the delivered browser builds.
export const defaultBrowserCores = 2;
export const defaultBrowserMemoryGb = 4;
export const defaultBrowserDiskGb = 30;
