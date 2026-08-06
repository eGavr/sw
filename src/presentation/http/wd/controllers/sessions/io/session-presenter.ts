import { Session } from "../../../../../../domain/entities/session/session";
import { Presenter } from "../../../../presenters/presenter";
import { SessionRoute } from "../../../session-route";

export class SessionPresenter implements Presenter {
    constructor(private readonly session: Session) {}

    present(): object {
        const id = this.session.endpoint && this.session.webDriverSessionId
            ? SessionRoute.encode(this.session.endpoint, this.session.webDriverSessionId)
            : this.session.id;

        return {
            id,
            environmentId: this.session.environmentId.getValue(),
            application: this.session.application.toObject(),
            webDriverSessionId: this.session.webDriverSessionId,
        };
    }
}
