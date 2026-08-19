import { Session } from "../../../../../../domain/entities/session/session";
import { Presenter } from "../../../../presenters/presenter";
import { SessionRoute } from "../../../../session-route";

// W3C WebDriver "New Session"-shaped response: { value: { sessionId, capabilities } }. The stateless
// WebSocket protocols (BiDi / DevTools / VNC) are advertised as vendor extension capabilities in our
// `sw:` namespace — the way Selenium Grid exposes `se:vnc` / `se:cdp` — rather than as ad-hoc top-level
// fields. `sw:vnc` is the raw RFB-over-WS URL a VNC viewer connects to (the hosted /interactive page, or
// the client's own noVNC).
export class SessionPresenter implements Presenter {
    constructor(
        private readonly session: Session,
        private readonly webSocketBaseUrl: string,
    ) {}

    present(): object {
        const sessionId = SessionRoute.encode(this.session.endpoint, this.session.webDriverSessionId);
        const proxy = `${this.webSocketBaseUrl}/sessions/${sessionId}/se`;

        return {
            value: {
                sessionId,
                capabilities: {
                    browserName: this.session.application.name,
                    browserVersion: this.session.application.version,
                    "sw:environmentId": this.session.environmentId.getValue(),
                    "sw:bidi": `${proxy}/bidi`,
                    "sw:cdp": `${proxy}/cdp`,
                    "sw:vnc": `${proxy}/vnc`,
                },
            },
        };
    }
}
