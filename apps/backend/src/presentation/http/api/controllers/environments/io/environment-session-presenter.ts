import { EnvironmentSession } from "../../../../../../application/use-cases/sessions/get-environment-session-use-case";
import { Presenter } from "../../../../presenters/presenter";
import { SessionRoute } from "../../../../session-route";

// The recovered capability id of the environment's current session — the same stateless encoding the wd
// data plane hands out at creation, so everything that accepts a session id accepts this one.
export class EnvironmentSessionPresenter implements Presenter {
    constructor(private readonly session: EnvironmentSession) {}

    present(): object {
        return {
            sessionId: SessionRoute.encode(this.session.endpoint, this.session.webDriverSessionId),
        };
    }
}
