import { InvalidArgumentError } from "../error/invalid-argument-error";

import { EnvironmentState } from "./environment-state";

// The universal binding-config key: how many simultaneous environments this binding may hold. Not
// kind-specific — every substrate honours it, and expensive ones derive their machine budget from it.
export const maxEnvironmentsConfigKey = "maxEnvironments";

// Install-level quota policy: the cap for a binding that names none, and the hard ceiling no binding
// may raise itself above (typo/abuse protection — the user widens their own quota, the install bounds it).
export class EnvironmentQuotaPolicy {
    constructor(
        readonly defaultLimit: number,
        readonly ceiling: number,
    ) {
        if (!Number.isInteger(defaultLimit) || defaultLimit < 1) {
            throw new InvalidArgumentError(`environment quota: default limit must be a positive integer, got ${defaultLimit}`);
        }

        if (!Number.isInteger(ceiling) || ceiling < defaultLimit) {
            throw new InvalidArgumentError(
                `environment quota: ceiling must be an integer >= the default limit, got ${ceiling}`,
            );
        }
    }
}

// What the quota counts against: everything alive or still holding resources — a `deleting`
// environment still occupies its machine until torn down. Only terminal `failed` rows are free.
const countedStates: ReadonlyArray<EnvironmentState> = [
    EnvironmentState.Enqueued,
    EnvironmentState.Starting,
    EnvironmentState.Preparing,
    EnvironmentState.Executing,
    EnvironmentState.Deleting,
];

export type EnvironmentQuotaClaim = {
    readonly cloudAccountId: string;
    readonly platformName: string;
    readonly execution: string;
    readonly countedStates: ReadonlyArray<EnvironmentState>;
    readonly limit: number;
};

// How many simultaneous environments one compute binding may hold. The effective limit is the
// binding's own `maxEnvironments` (the user widening their spend) clamped by the install ceiling,
// else the install default. The data source only translates the ready claim into count-and-insert.
export class EnvironmentQuota {
    static fromBindingConfig(config: Record<string, unknown>, policy: EnvironmentQuotaPolicy): EnvironmentQuota {
        const configured = config[maxEnvironmentsConfigKey];
        const limit = typeof configured === "number" && Number.isInteger(configured) && configured >= 1
            ? Math.min(configured, policy.ceiling)
            : policy.defaultLimit;

        return new EnvironmentQuota(limit);
    }

    // Guard for writing the binding config: absent is fine (the default applies), anything else must
    // be a whole number of environments within the install's ceiling.
    static validateConfigured(value: unknown, policy: EnvironmentQuotaPolicy): void {
        if (value === undefined || value === null) {
            return;
        }

        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > policy.ceiling) {
            throw new InvalidArgumentError(
                `${maxEnvironmentsConfigKey}: must be a whole number between 1 and ${policy.ceiling}`,
            );
        }
    }

    private constructor(readonly limit: number) {}

    toClaim(cloudAccountId: string, platformName: string, execution: string): EnvironmentQuotaClaim {
        return {
            cloudAccountId,
            platformName,
            execution,
            countedStates,
            limit: this.limit,
        };
    }
}
