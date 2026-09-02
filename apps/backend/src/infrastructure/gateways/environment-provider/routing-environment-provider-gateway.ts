import {
    CloudReachability,
    EnvironmentProviderGateway,
} from "../../../application/interfaces/gateways/environment-provider-gateway";
import { CloudAccount } from "../../../domain/entities/cloud-account/cloud-account";
import { Environment } from "../../../domain/entities/environment/environment";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The adapter key is the cloud type, the full stereotype AND the compute kind: a cloud can run one
// substrate several ways (yandex-cloud linux/container as per-env VMs or kubernetes pods), and each
// (cloud x stereotype x kind) is served by exactly one adapter. E.g. local:linux:container:docker,
// yandex-cloud:android:container:vm, yandex-cloud:linux:container:kubernetes.
export function routingKey(cloudType: string, platformName: string, execution: string, kind: string): string {
    return `${cloudType}:${platformName}:${execution}:${kind}`;
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

    // Every binding is probed by ITS kind's adapter (the vm kind checks the folder, kubernetes the
    // cluster) and the verdicts aggregate — the badge answers for the whole connection.
    async checkAccess(cloudAccount: CloudAccount): Promise<CloudReachability> {
        const verdicts = await Promise.all(cloudAccount.computeBindings().map((binding) => {
            const key = routingKey(
                cloudAccount.type,
                binding.stereotype.platformName,
                binding.stereotype.execution,
                binding.kind,
            );

            return this.at(key).checkAccess(cloudAccount);
        }));

        const failed = verdicts.filter((verdict) => !verdict.reachable);

        if (failed.length > 0) {
            return { reachable: false, detail: failed.map((verdict) => verdict.detail).filter(Boolean).join("; ") };
        }

        return { reachable: true };
    }

    private gatewayFor(environment: Environment): EnvironmentProviderGateway {
        if (!environment.cloudType || !environment.computeKind) {
            throw new InternalError(`environment ${environment.id}: no cloud type/compute kind to route to`);
        }

        return this.at(routingKey(
            environment.cloudType,
            environment.platform.name,
            environment.execution,
            environment.computeKind,
        ));
    }

    private at(key: string): EnvironmentProviderGateway {
        const gateway = this.gatewaysByKey.get(key);

        if (!gateway) {
            throw new InternalError(`compute route: ${key}: unknown`);
        }

        return gateway;
    }
}
