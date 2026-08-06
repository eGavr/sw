import { Environment } from "../../../../../../domain/entities/environment/environment";
import { defaultHeartbeatFreshnessMs } from "../../../../../../domain/entities/environment/heartbeat-freshness";
import { Presenter } from "../../../../presenters/presenter";

export class EnvironmentHeartbeatPresenter implements Presenter {
    constructor(private readonly environment: Environment) {}

    present(): object {
        return {
            uid: this.environment.id,
            state: this.environment.effectiveStatus(new Date(), defaultHeartbeatFreshnessMs),
        };
    }
}
