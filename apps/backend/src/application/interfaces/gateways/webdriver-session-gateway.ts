import { Application } from "../../../domain/entities/environment/application/application";

export type WebDriverSessionOptions = {
    // Opt-in per session: capture this session's logs and upload them (carried to the node as the
    // `sw:logging` capability, which the in-pod agent reads back to decide whether to ship logs).
    readonly logging?: boolean;
    // Opt-in per session: record this session's video and upload it (carried to the node as the
    // `sw:video` capability, which the in-pod agent reads back to decide whether to record).
    readonly video?: boolean;
};

// Driven port over a running WebDriver node: creates a session on the node at `endpoint` and returns
// its (secret) WebDriver session id. Calling the node is an external-system action, so it is a gateway,
// not a repository. The node itself arbitrates the 1:1 occupancy, rejecting a second session. The
// platform selects the capability dialect — a browser (browserName) vs an Appium device (platformName +
// appium:* on an Android node).
export abstract class WebDriverSessionGateway {
    abstract create(
        endpoint: string,
        application: Application,
        platformName: string,
        options?: WebDriverSessionOptions,
    ): Promise<string>;
}
