import { Environment } from "../../../../../../../../domain/entities/environment/environment";
import { ResponseDto } from "../../../../../dtos/response-dto";

export class EnvironmentDto implements ResponseDto {
    constructor(private readonly environment: Environment) {}

    toObject(): object {
        return {
            name: `accounts/${this.environment.accountId.getValue()}/environments/${this.environment.id}`,
            uid: this.environment.id,
            platform: this.environment.platform.toObject(),
            applications: this.environment.applications.toArray(),
            providerName: this.environment.providerName,
            createTime: this.environment.createdAt.toISOString(),
        };
    }
}
