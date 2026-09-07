import { ApplicationData } from "../../../../domain/entities/environment/application/application";
import { PlatformData } from "../../../../domain/entities/environment/platform/platform";

export type DockerProvisioning = {
    image: string;
    env: Record<string, string>;
};

export type ScreenGeometry = {
    width: number;
    height: number;
};

export type DockerEnvironmentConfig = {
    // The base image template, `{version}` standing for the environment's platform version — one image
    // per ubuntu release, never per browser (the install default, overridable per binding).
    baseImage?: string;
    platform?: string;
    internalPort: number;
    // Install-level: the image's bootstrap the agent bootstrap execs after starting the agent.
    entrypoint: string;
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
export const defaultBaseImage = "sw-linux-base:{version}";
export const defaultScreen: ScreenGeometry = { width: 1360, height: 1020 };
// Where the node script leaves what it detected about each delivered build, for the agent's registration.
export const detectedApplicationsFile = "/tmp/sw-detected.json";

// Resolves what to run for an environment: the base image of its platform version, and the delivery
// list the node script pulls through the control plane — every application with an artifact, encoded
// as `word~webdriverFlag` pairs (both characters are outside the application-name alphabet), preinstalled
// ones having nothing to pull.
export function resolveDockerProvisioning(
    platform: PlatformData,
    applications: ReadonlyArray<ApplicationData>,
    options: { baseImage?: string },
): DockerProvisioning {
    const delivered = applications
        .filter((application) => application.source?.appRef)
        .map((application) => `${application.nameAlias}~${application.source?.webdriverRef ? 1 : 0}`);

    return {
        image: (options.baseImage ?? defaultBaseImage).replace("{version}", platform.version),
        env: {
            SW_APPS: delivered.join(","),
            SW_DETECTED_APPS_FILE: detectedApplicationsFile,
        },
    };
}
