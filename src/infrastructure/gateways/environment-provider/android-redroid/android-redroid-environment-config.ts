import { ApplicationData } from "../../../../domain/entities/environment/application/application";

export type AndroidRedroidEnvironmentConfig = {
    // The redroid image serving the requested Android (a fixed tag, or a `{version}` template keyed by the
    // application version), run privileged on a binder-enabled host.
    redroidImage: (application: ApplicationData) => string;
    // The companion node image (Appium + scrcpy/x11vnc/noVNC + status shim) that drives the redroid device
    // and presents a Selenium-node-compatible surface, so the wd proxy and heartbeat agent are unchanged.
    nodeImage: string;
    // Port the companion node (nginx) serves on inside the shared network namespace, published on the host.
    nodePort: number;
    // Screen geometry the redroid device, scrcpy/Xvfb and the ffmpeg recording all agree on.
    screenWidth: number;
    screenHeight: number;
    dpi: number;
    // Entrypoint the agent bootstrap execs inside the companion container.
    entrypoint: string;
    // Host address the node is reachable at (used to build SW_ENDPOINT for the in-container agent).
    advertiseHost: string;
    // Base URL the in-container agent calls back on, and the shared secret it authenticates with.
    internalUrl: string;
    internalSecret: string;
};

export type BuildAndroidRedroidEnvironmentConfigOptions = {
    redroidImage: string;
    nodeImage: string;
    nodePort: number;
    screenWidth: number;
    screenHeight: number;
    dpi: number;
    entrypoint: string;
    advertiseHost: string;
    internalUrl: string;
    internalSecret: string;
};

export const defaultRedroidImage = "redroid/redroid:11.0.0-latest";
export const defaultAndroidNodeImage = "sw/android-node:latest";
export const defaultAndroidNodePort = 4444;
export const defaultAndroidNodeEntrypoint = "/opt/android-node/start.sh";
export const defaultAndroidScreen = { width: 720, height: 1280, dpi: 320 };

export function buildAndroidRedroidEnvironmentConfig(
    options: BuildAndroidRedroidEnvironmentConfigOptions,
): AndroidRedroidEnvironmentConfig {
    const image = options.redroidImage;

    return {
        redroidImage: (application) => (image.includes("{version}") ? image.replace("{version}", application.version) : image),
        nodeImage: options.nodeImage,
        nodePort: options.nodePort,
        screenWidth: options.screenWidth,
        screenHeight: options.screenHeight,
        dpi: options.dpi,
        entrypoint: options.entrypoint,
        advertiseHost: options.advertiseHost,
        internalUrl: options.internalUrl,
        internalSecret: options.internalSecret,
    };
}
