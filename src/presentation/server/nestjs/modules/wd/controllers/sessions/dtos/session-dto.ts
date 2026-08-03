import { Session } from "../../../../../../../../domain/entities/session/session";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class SessionDto implements ResponseDto {
    constructor(private readonly session: Session) {}

    toObject(): object {
        return {
            id: this.session.id,
            environmentId: this.session.environmentId.getValue(),
            application: this.session.application.toObject(),
            webDriverSessionId: this.session.webDriverSessionId,
        };
    }
}
