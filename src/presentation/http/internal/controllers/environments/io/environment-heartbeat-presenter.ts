import { Environment } from "../../../../../../domain/entities/environment/environment";
import { Presenter } from "../../../../presenters/presenter";

// Freshness window for deriving the effective status from the heartbeat. Configurable in stage 6.
const heartbeatFreshnessMs = 6_000;

export class EnvironmentHeartbeatPresenter implements Presenter {
    constructor(private readonly environment: Environment) {}

    present(): object {
        return {
            uid: this.environment.id,
            state: this.environment.effectiveStatus(new Date(), heartbeatFreshnessMs),
        };
    }
}
