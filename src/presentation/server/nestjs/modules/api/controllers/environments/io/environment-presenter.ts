import { Environment } from "../../../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../../presenters/presenter";

export class EnvironmentPresenter implements Presenter {
    constructor(private readonly environment: Environment) {}

    present(): object {
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
