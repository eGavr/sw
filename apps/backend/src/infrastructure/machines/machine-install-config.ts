import { ConfigService } from "@nestjs/config";

// Fallback callback-API port when INTERNAL_PORT is unset; the env files always set it to 3002.
const defaultInternalCallbackPort = 3002;

// What an install command needs to say: where the machine reaches the control plane's internal API
// (SELF_HOSTED_INTERNAL_URL — the address routable FROM the user's machines, never the loopback the
// control plane sees itself at, unless the machine IS this box).
export class MachineInstallConfig {
    constructor(readonly internalUrl: string) {}

    installCommand(machineId: string, registrationToken: string): string {
        return `curl -fsSL "${this.internalUrl}/internal/machines/installer:download"`
            + ` | SW_INTERNAL_URL="${this.internalUrl}" SW_MACHINE_ID="${machineId}"`
            + ` SW_REGISTRATION_TOKEN="${registrationToken}" bash`;
    }
}

export const MachineInstallConfigProvider = {
    provide: MachineInstallConfig,
    useFactory: (configService: ConfigService): MachineInstallConfig => {
        const internalPort = configService.get<string>("INTERNAL_PORT") ?? String(defaultInternalCallbackPort);

        return new MachineInstallConfig(
            configService.get<string>("SELF_HOSTED_INTERNAL_URL") ?? `http://127.0.0.1:${internalPort}`,
        );
    },
    inject: [ConfigService],
};
