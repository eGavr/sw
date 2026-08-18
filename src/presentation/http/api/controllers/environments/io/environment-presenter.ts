import { Environment } from "../../../../../../domain/entities/environment/environment";
import { defaultHeartbeatFreshnessMs } from "../../../../../../domain/entities/environment/heartbeat-freshness";
import { Presenter } from "../../../../presenters/presenter";

export class EnvironmentPresenter implements Presenter {
    constructor(private readonly environment: Environment) {}

    present(): object {
        const reason = this.environment.stateReason;

        return {
            name: `projects/${this.environment.projectId.getValue()}/environments/${this.environment.id}`,
            uid: this.environment.id,
            state: this.environment.effectiveStatus(new Date(), defaultHeartbeatFreshnessMs),
            ...(reason ? { stateReason: reason } : {}),
            platform: this.environment.platform.toObject(),
            execution: this.environment.execution,
            applications: this.environment.applications.toArray(),
            createTime: this.environment.createdAt.toISOString(),
        };
    }
}
