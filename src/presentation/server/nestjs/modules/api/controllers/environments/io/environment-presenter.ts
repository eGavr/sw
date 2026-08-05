import { Environment } from "../../../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../../presenters/presenter";

// Freshness window for deriving the effective status from the heartbeat. Configurable in stage 6.
const heartbeatFreshnessMs = 6_000;

export class EnvironmentPresenter implements Presenter {
    constructor(private readonly environment: Environment) {}

    present(): object {
        const reason = this.environment.stateReason;

        return {
            name: `accounts/${this.environment.accountId.getValue()}/environments/${this.environment.id}`,
            uid: this.environment.id,
            state: this.environment.effectiveStatus(new Date(), heartbeatFreshnessMs),
            ...(reason ? { stateReason: reason } : {}),
            platform: this.environment.platform.toObject(),
            applications: this.environment.applications.toArray(),
            createTime: this.environment.createdAt.toISOString(),
        };
    }
}
