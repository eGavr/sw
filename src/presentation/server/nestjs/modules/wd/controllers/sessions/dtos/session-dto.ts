import { Session } from "../../../../../../../../domain/entities/session/session";
import { ResponseDto } from "../../../../../dtos/response-dto";
import { SessionRoute } from "../../../session-route";

export class SessionDto implements ResponseDto {
    constructor(private readonly session: Session) {}

    toObject(): object {
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
