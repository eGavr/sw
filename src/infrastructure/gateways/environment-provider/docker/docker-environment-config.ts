import { ApplicationData } from "../../../../domain/entities/environment/application/application";

export type DockerProvisioning = {
    image: string;
    env?: Record<string, string>;
};

export type DockerEnvironmentConfig = {
    resolve: (application: ApplicationData) => DockerProvisioning;
    internalPort: number;
    sessionTimeoutSeconds: number;
    // Image entrypoint the bootstrap execs after starting the agent (selenium base default).
    entrypoint: string;
    // Host address the node is reachable at (used to build SW_ENDPOINT for the in-container agent).
    advertiseHost: string;
    // Base URL the in-container agent calls back on, and the shared secret it authenticates with.
    internalUrl: string;
    internalSecret: string;
    platform?: string;
};

export type BuildDockerEnvironmentConfigOptions = {
    image?: string;
    baseImage?: string;
    internalPort: number;
    sessionTimeoutSeconds: number;
    entrypoint: string;
    advertiseHost: string;
    internalUrl: string;
    internalSecret: string;
    platform?: string;
};

export const defaultInternalPort = 4444;

// Idle timeout the browser node enforces per session: it kills a session that receives no command
// within this window and resets it on every command — the "smart" idle timeout, delegated to the node.
export const defaultSessionTimeoutSeconds = 300;

// Prebuilt strategy: the browser is baked into the image tag. `image` is a fixed tag or a template
// with `{version}`; without it, falls back to the amd64 selenium images keyed by version.
function prebuiltResolver(image: string | undefined): DockerEnvironmentConfig["resolve"] {
    return (application) => ({
        image: image
            ? (image.includes("{version}") ? image.replace("{version}", application.version) : image)
            : `selenium/standalone-chrome:${application.version}`,
    });
}

// Install strategy: a custom base image that installs the requested browser at startup, reading its
// name and version from these env vars — the base image's entrypoint contract.
function installResolver(baseImage: string): DockerEnvironmentConfig["resolve"] {
    return (application) => ({
        image: baseImage,
        env: {
            SW_BROWSER_NAME: application.name,
            SW_BROWSER_VERSION: application.version,
        },
    });
}

export function buildDockerEnvironmentConfig(options: BuildDockerEnvironmentConfigOptions): DockerEnvironmentConfig {
    return {
        resolve: options.baseImage ? installResolver(options.baseImage) : prebuiltResolver(options.image),
        internalPort: options.internalPort,
        sessionTimeoutSeconds: options.sessionTimeoutSeconds,
        entrypoint: options.entrypoint,
        advertiseHost: options.advertiseHost,
        internalUrl: options.internalUrl,
        internalSecret: options.internalSecret,
        platform: options.platform,
    };
}
