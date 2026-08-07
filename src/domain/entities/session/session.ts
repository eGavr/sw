import { Application } from "../environment/application/application";
import { EnvironmentId } from "../environment/environment-id";

export type SessionCreateParams = {
    environmentId: EnvironmentId;
    application: Application;
    endpoint: string;
    webDriverSessionId: string;
};

// The result of allocating a session onto an environment's node: which environment and application it
// runs, the node's endpoint, and the WebDriver session id the node returned. Not persisted — the node
// is the session's source of truth (it enforces the idle timeout and the one-active-session rule), and
// the wire id is derived from the endpoint + WebDriver session id for stateless routing.
export class Session {
    static create(params: SessionCreateParams): Session {
        return new Session(params.environmentId, params.application, params.endpoint, params.webDriverSessionId);
    }

    private constructor(
        private readonly _environmentId: EnvironmentId,
        readonly application: Application,
        readonly endpoint: string,
        readonly webDriverSessionId: string,
    ) {}

    get environmentId(): EnvironmentId {
        return this._environmentId;
    }
}
