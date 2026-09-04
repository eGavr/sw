import { ConfigService } from "@nestjs/config";

import { EnvironmentQuotaPolicy } from "../../domain/entities/environment/environment-quota";

// The default is deliberately small: an environment is real money (a VM, a k8s pod, a seat on a
// leased machine), so a fresh binding starts with a handful and the user consciously widens their own
// quota — up to ENVIRONMENTS_PER_BINDING_MAX.
const defaultLimit = 5;
const defaultMaxLimit = 1000;

export const EnvironmentQuotaPolicyProvider = {
    provide: EnvironmentQuotaPolicy,
    useFactory: (configService: ConfigService): EnvironmentQuotaPolicy => new EnvironmentQuotaPolicy(
        Number(configService.get<string>("ENVIRONMENTS_PER_BINDING_DEFAULT") ?? String(defaultLimit)),
        Number(configService.get<string>("ENVIRONMENTS_PER_BINDING_MAX") ?? String(defaultMaxLimit)),
    ),
    inject: [ConfigService],
};
