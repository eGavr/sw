import { Environment } from "../../../../../../../../domain/entities/environment/environment";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class EnvironmentDto implements ResponseDto {
    constructor(private readonly environment: Environment) {}

    toObject(): object {
        return {
            id: this.environment.id,
            accountId: this.environment.accountId.getValue(),
            providerName: this.environment.providerName,
            platform: this.environment.platform.toObject(),
            applications: this.environment.applications.toArray(),
            endpoint: this.environment.endpoint,
            createdAt: this.environment.createdAt.toISOString(),
        };
    }
}
