import { ApplicationData } from "../../../domain/entities/environment/application/application";
import { PlatformData } from "../../../domain/entities/environment/platform/platform";

export type ScreenGeometry = {
    width: number;
    height: number;
};

export type LinuxNodeProvisioning = {
    image: string;
    env: Record<string, string>;
};

export type LinuxNodeParams = {
    platform: PlatformData;
    applications: ReadonlyArray<ApplicationData>;
    // The base image template, `{version}` standing for the platform version — one image per ubuntu
    // release, never per browser.
    baseImage: string;
    // The session idle timeout the node's wd door enforces.
    sessionTimeoutSeconds: number;
    // The headless display the browser renders on (also the video record size).
    screen: ScreenGeometry;
};

export const defaultLinuxBaseImage = "sw-linux-base:{version}";
export const defaultScreen: ScreenGeometry = { width: 1360, height: 1020 };
// Where the node script leaves what it detected about each delivered build, for the agent's registration.
export const detectedApplicationsFile = "/tmp/sw-detected.json";

// What every linux compute adapter runs, whatever hosts the container (the operator's docker, a pod, a
// VM): the base image of the platform version, and the node script's parameters as container env — the
// delivery list it pulls through the control plane (every application with an artifact, encoded as
// `word~webdriverFlag` pairs, both characters outside the application-name alphabet; preinstalled ones
// having nothing to pull), the detection report path, the idle timeout and the display geometry.
export function linuxNodeProvisioning(params: LinuxNodeParams): LinuxNodeProvisioning {
    const delivered = params.applications
        .filter((application) => application.source?.appRef)
        .map((application) => `${application.nameAlias}~${application.source?.webdriverRef ? 1 : 0}`);

    return {
        image: params.baseImage.replace("{version}", params.platform.version),
        env: {
            SW_APPS: delivered.join(","),
            SW_DETECTED_APPS_FILE: detectedApplicationsFile,
            SW_SESSION_IDLE_TIMEOUT_SECONDS: String(params.sessionTimeoutSeconds),
            SW_SCREEN_WIDTH: String(params.screen.width),
            SW_SCREEN_HEIGHT: String(params.screen.height),
        },
    };
}
