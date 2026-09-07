import { Session } from "../../../../../../domain/entities/session/session";
import { Presenter } from "../../../../presenters/presenter";
import { SessionRoute } from "../../../../session-route";

import { ApplicationCapability } from "./session-capabilities";

// W3C WebDriver "New Session"-shaped response: { value: { sessionId, capabilities } }. The application
// is named back in the vocabulary the request used (browserName/browserVersion or sw:appName/
// sw:appVersion), with the honest platform stereotype it landed on (the W3C platformName plus our
// version/device parts). The stateless WebSocket protocols (BiDi / DevTools / VNC) are
// advertised as vendor extension capabilities in our `sw:` namespace — the way Selenium Grid exposes
// `se:vnc` / `se:cdp` — rather than as ad-hoc top-level fields. `sw:vnc` is the raw RFB-over-WS URL a
// VNC client connects to; `sw:interactive` is the ready-to-open hosted viewer page — an https URL a
// human clicks to watch and drive the session — which connects to it.
export class SessionPresenter implements Presenter {
    constructor(
        private readonly session: Session,
        private readonly applicationCapability: ApplicationCapability,
        private readonly webSocketBaseUrl: string,
        private readonly httpBaseUrl: string,
    ) {}

    present(): object {
        const sessionId = SessionRoute.encode(this.session.endpoint, this.session.webDriverSessionId);
        const proxy = `${this.webSocketBaseUrl}/sessions/${sessionId}/se`;

        return {
            value: {
                sessionId,
                capabilities: {
                    ...this.applicationCapabilities(),
                    platformName: this.session.platform.name,
                    "sw:platformVersion": this.session.platform.version,
                    "sw:deviceModel": this.session.platform.deviceModel,
                    "sw:environmentId": this.session.environmentId.getValue(),
                    "sw:bidi": `${proxy}/bidi`,
                    "sw:cdp": `${proxy}/cdp`,
                    "sw:vnc": `${proxy}/vnc`,
                    "sw:interactive": `${this.httpBaseUrl}/interactive?path=sessions/${sessionId}/se/vnc`,
                },
            },
        };
    }

    private applicationCapabilities(): object {
        const { nameAlias, version } = this.session.application;

        return this.applicationCapability === "browserName"
            ? { browserName: nameAlias, browserVersion: version }
            : { "sw:appName": nameAlias, "sw:appVersion": version };
    }
}
