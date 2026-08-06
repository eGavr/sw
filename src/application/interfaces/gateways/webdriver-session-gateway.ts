import { Application } from "../../../domain/entities/environment/application/application";

// Driven port over a running WebDriver node: creates a session on the node at `endpoint` and returns
// its (secret) WebDriver session id. Calling the node is an external-system action, so it is a gateway,
// not a repository. The node itself arbitrates the 1:1 occupancy, rejecting a second session.
export abstract class WebDriverSessionGateway {
    abstract create(endpoint: string, application: Application): Promise<string>;
}
