import { ApplicationData } from "../../../../domain/entities/environment/application/application";

export type DockerProvisioning = {
    image: string;
    env?: Record<string, string>;
};

export type DockerEnvironmentConfig = {
    // Provisioning shape — the install default, overridable per project from the substrate binding config.
    image?: string;
    baseImage?: string;
    platform?: string;
    internalPort: number;
    // Install-level: the node's image entrypoint the bootstrap execs after starting the agent.
    entrypoint: string;
    // Install-level: host address the node is reachable at (used to build SW_ENDPOINT for the agent).
    advertiseHost: string;
    // Install-level: base URL the in-container agent calls back on (its per-env token is minted separately).
    internalUrl: string;
    // Install-level: ws base of the control-plane NetBridge rendezvous the forwarder dials out to. Unset
    // disables local-network tunnelling for this substrate (the forwarder is not launched).
    netBridgeUrl?: string;
    // Session idle timeout (domain policy), translated into the node's SE_NODE_SESSION_TIMEOUT.
    sessionTimeoutSeconds: number;
};

export const defaultInternalPort = 4444;

// Resolves the container image for an application. Prebuilt: the browser is baked into the tag (`image`
// is a fixed tag or a `{version}` template; without it, the amd64 selenium images keyed by version).
// Install: a custom `baseImage` installs the requested browser at startup, reading name/version from env.
export function resolveDockerProvisioning(
    application: ApplicationData,
    options: { image?: string; baseImage?: string },
): DockerProvisioning {
    if (options.baseImage) {
        return {
            image: options.baseImage,
            env: { SW_BROWSER_NAME: application.name, SW_BROWSER_VERSION: application.version },
        };
    }

    const image = options.image;

    return {
        image: image
            ? (image.includes("{version}") ? image.replace("{version}", application.version) : image)
            : `selenium/standalone-chrome:${seleniumTag(application.version)}`,
    };
}

// Transitional until the unified delivery path (base image + catalog artifacts) replaces prebuilt
// selenium images: installed versions are honestly full ("152.0.7977.82") while selenium publishes
// major-versioned browser tags ("152.0").
function seleniumTag(version: string): string {
    const [major] = version.split(".");

    return `${major}.0`;
}
