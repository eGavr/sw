import { Session } from "../../../../../../domain/entities/session/session";
import { Presenter } from "../../../../presenters/presenter";
import { SessionRoute } from "../../../session-route";

export class SessionPresenter implements Presenter {
    constructor(
        private readonly session: Session,
        private readonly webSocketBaseUrl: string,
    ) {}

    present(): object {
        const id = this.session.endpoint && this.session.webDriverSessionId
            ? SessionRoute.encode(this.session.endpoint, this.session.webDriverSessionId)
            : this.session.id;

        return {
            id,
            environmentId: this.session.environmentId.getValue(),
            application: this.session.application.toObject(),
            webDriverSessionId: this.session.webDriverSessionId,
            // The proxy routes `/sessions/{id}/se/{protocol}` by decoding the endpoint from the id, so
            // these are advertised outright instead of leaving clients to build them by convention.
            webSocketUrls: {
                bidi: `${this.webSocketBaseUrl}/sessions/${id}/se/bidi`,
                cdp: `${this.webSocketBaseUrl}/sessions/${id}/se/cdp`,
                vnc: `${this.webSocketBaseUrl}/sessions/${id}/se/vnc`,
            },
        };
    }
}
