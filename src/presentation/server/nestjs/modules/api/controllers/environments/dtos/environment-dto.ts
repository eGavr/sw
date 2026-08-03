import { Environment } from "../../../../../../../../domain/entities/environment/environment";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class EnvironmentDto implements ResponseDto {
    constructor(private readonly environment: Environment) {}

    toObject(): object {
        // `endpoint` is intentionally NOT exposed: it is the container's internal WebDriver address.
        // Clients reach the browser only through the wd proxy (via the session id), never directly.
        return {
            id: this.environment.id,
            accountId: this.environment.accountId.getValue(),
            providerName: this.environment.providerName,
            platform: this.environment.platform.toObject(),
            applications: this.environment.applications.toArray(),
            createdAt: this.environment.createdAt.toISOString(),
        };
    }
}
