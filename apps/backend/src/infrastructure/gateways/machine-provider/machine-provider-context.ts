import { MachineProviderConfig } from "../../../application/interfaces/gateways/machine-provider-gateway";
import { Stereotype } from "../../../domain/entities/cloud-account/stereotype";
import { toExecution } from "../../../domain/entities/environment/execution";
import { InternalError } from "../../../domain/entities/error/internal-error";

// The routing discriminators inside the otherwise-opaque provider context/config: WHICH cloud the
// machines come from (cloud type — no vocabulary of its own, clouds are already the "who provides
// resources" axis), which cloud ACCOUNT (the inventory a self-hosted cloud draws from) and which
// STEREOTYPE the pool serves (what the machine must provide). The bridge stamps them from the binding
// when seating and probing; every lease row carries them in providerContext from birth — so any later
// call (return, orphan sweep) still knows a machine's cloud even after the binding is gone.
export const machineProviderCloudKey = "cloud";
export const machineProviderAccountKey = "cloudAccountId";
export const machineProviderPlatformKey = "platformName";
export const machineProviderExecutionKey = "execution";

export function stampProviderContext(
    config: Record<string, unknown>,
    cloud: { type: string; id: string },
    stereotype: Stereotype,
): MachineProviderConfig {
    return {
        ...config,
        [machineProviderCloudKey]: cloud.type,
        [machineProviderAccountKey]: cloud.id,
        [machineProviderPlatformKey]: stereotype.platformName,
        [machineProviderExecutionKey]: stereotype.execution,
    };
}

export function accountOf(config: MachineProviderConfig): string {
    const account = config[machineProviderAccountKey];

    if (typeof account !== "string" || account === "") {
        throw new InternalError("machine provider: the context names no cloud account");
    }

    return account;
}

export function stereotypeOf(config: MachineProviderConfig): Stereotype {
    const platform = config[machineProviderPlatformKey];
    const execution = config[machineProviderExecutionKey];

    if (typeof platform !== "string" || typeof execution !== "string") {
        throw new InternalError("machine provider: the context names no stereotype");
    }

    return new Stereotype(platform, toExecution(execution));
}
