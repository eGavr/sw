import { ConfigService } from "@nestjs/config";

import { EnvironmentQuotaPolicy } from "../../domain/entities/environment/environment-quota";

// Deliberately small: an environment is real money (a VM, a k8s pod, a seat on a leased machine), so
// a fresh binding starts with a handful and the user consciously widens their own quota — up to the
// install's ceiling.
const defaultLimit = 5;
const defaultCeiling = 50;

export const EnvironmentQuotaPolicyProvider = {
    provide: EnvironmentQuotaPolicy,
    useFactory: (configService: ConfigService): EnvironmentQuotaPolicy => new EnvironmentQuotaPolicy(
        Number(configService.get<string>("ENVIRONMENT_QUOTA_DEFAULT") ?? String(defaultLimit)),
        Number(configService.get<string>("ENVIRONMENT_QUOTA_CEILING") ?? String(defaultCeiling)),
    ),
    inject: [ConfigService],
};
