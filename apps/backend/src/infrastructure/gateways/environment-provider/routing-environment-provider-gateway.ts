import {
    CloudReachability,
    EnvironmentProviderGateway,
} from "../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../domain/entities/environment/environment";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The adapter key is the cloud type plus the full stereotype (platform, execution): a cloud offers several
// compute kinds — its subdivisions — and each (cloud x stereotype) pair is served by exactly one adapter.
// E.g. local/linux/container -> docker, yandex-cloud/android/container -> redroid VM,
// yandex-cloud/android/emulator -> emulator VM. The same kind on another cloud is just another entry.
export function routingKey(cloudType: string, platformName: string, execution: string): string {
    return `${cloudType}:${platformName}:${execution}`;
}

// One EnvironmentProviderGateway over many backend adapters: each action is routed to the adapter for the
// environment's (cloud type, platform, execution) — captured on the environment at creation — so the worker
// use cases stay unaware of per-project routing and never load the cloud account just to pick an adapter.
export class RoutingEnvironmentProviderGateway extends EnvironmentProviderGateway {
    constructor(private readonly gatewaysByKey: Map<string, EnvironmentProviderGateway>) {
        super();
    }

    async provision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.gatewayFor(environment).provision(environment, cloudAccount);
    }

    async deprovision(environment: Environment, cloudAccount: CloudAccount | null): Promise<void> {
        await this.gatewayFor(environment).deprovision(environment, cloudAccount);
    }

    // A cloud account is probed via any of its substrates' adapters — access is folder/identity level, the
    // same for every subdivision of the cloud — so the first provided stereotype picks the adapter.
    async checkAccess(cloudAccount: CloudAccount): Promise<CloudReachability> {
        return this.gatewayForAccount(cloudAccount).checkAccess(cloudAccount);
    }

    private gatewayFor(environment: Environment): EnvironmentProviderGateway {
        if (!environment.cloudType) {
            throw new InternalError(`environment ${environment.id}: no cloud type to route to`);
        }

        return this.at(routingKey(environment.cloudType, environment.platform.name, environment.execution));
    }

    private gatewayForAccount(cloudAccount: CloudAccount): EnvironmentProviderGateway {
        const [stereotype] = cloudAccount.providedStereotypes();

        if (!stereotype) {
            throw new InternalError(`cloud account ${cloudAccount.id}: no substrate to route to`);
        }

        return this.at(routingKey(cloudAccount.type, stereotype.platformName, stereotype.execution));
    }

    private at(key: string): EnvironmentProviderGateway {
        const gateway = this.gatewaysByKey.get(key);

        if (!gateway) {
            throw new InternalError(`compute route: ${key}: unknown`);
        }

        return gateway;
    }
}
