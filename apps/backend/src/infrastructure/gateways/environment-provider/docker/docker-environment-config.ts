import { ScreenGeometry } from "../linux-node";

export type DockerEnvironmentConfig = {
    // The base image template, `{version}` standing for the environment's platform version — one image
    // per ubuntu release, never per browser (the install default, overridable per binding).
    baseImage: string;
    platform?: string;
    internalPort: number;
    // Install-level: host address the node is reachable at (used to build SW_ENDPOINT for the agent).
    advertiseHost: string;
    // Install-level: base URL the in-container agent calls back on (its per-env token is minted separately).
    internalUrl: string;
    // Install-level: ws base of the control-plane NetBridge rendezvous the forwarder dials out to. Unset
    // disables local-network tunnelling for this substrate (the forwarder is not launched).
    netBridgeUrl?: string;
    // Session idle timeout (domain policy), enforced by the node's wd door.
    sessionTimeoutSeconds: number;
    // The headless display the browser renders on (also the video record size).
    screen: ScreenGeometry;
};

export const defaultInternalPort = 4444;
