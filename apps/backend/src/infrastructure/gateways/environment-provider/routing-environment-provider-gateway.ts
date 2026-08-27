import { EnvironmentProviderGateway } from "../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../domain/entities/environment/environment";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The adapter key is the (cloud type, execution) pair: e.g. yandex-cloud/container -> redroid,
// yandex-cloud/emulator -> emulator, docker/container -> docker. So one adapter serves a compute kind on
// its cloud, and the same kind on another cloud is just another (type, execution) entry — no duplication.
export function routingKey(cloudType: string, execution: string): string {
    return `${cloudType}:${execution}`;
}

// One EnvironmentProviderGateway over many backend adapters: each action is routed to the adapter for the
// environment's (cloud type, execution) — captured on the environment at creation — so the worker use
// cases stay unaware of per-project routing and never load the cloud account just to pick an adapter.
export class RoutingEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(private readonly gatewaysByKey: Map<string, EnvironmentProviderGateway>) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.gatewayFor(environment).provision(environment, cloudAccount);
    }

    async deprovision(environment: Environment): Promise<void> {
        await this.gatewayFor(environment).deprovision(environment);
    }

    private gatewayFor(environment: Environment): EnvironmentProviderGateway {
        if (!environment.cloudType) {
            throw new InternalError(`environment ${environment.id}: no cloud type to route to`);
        }

        const key = routingKey(environment.cloudType, environment.execution);
        const gateway = this.gatewaysByKey.get(key);

        if (!gateway) {
            throw new InternalError(`compute route: ${key}: unknown`);
        }

        return gateway;
    }
}
