import { Injectable } from "@nestjs/common";

import { Machine } from "../../../domain/entities/machine/machine";
import { MachineId } from "../../../domain/entities/machine/machine-id";
import { UserPermissionName } from "../../../domain/entities/user/user-permission-name";
import { RegistrationTokenService } from "../../interfaces/registration-token-service";
import { MachineRepository } from "../../interfaces/repositories/machine-repository";

import { MachineAccess } from "./machine-access";

export type GenerateRegistrationTokenInput = {
    readonly creds: { readonly token: string };
    readonly params: {
        readonly projectId: string;
        readonly cloudAccountId: string;
        readonly machineId: string;
    };
};

export type RegistrationTokenGrant = {
    readonly machine: Machine;
    readonly token: string;
    readonly expiresAt: Date;
};

// An hour is enough to paste the install command and let it run; a token left unused simply expires.
const registrationTokenTtlMs = 60 * 60 * 1000;

// Mints the one-time registration token for a machine's install command. Shown once — only its hash is
// kept; re-issuing (a reinstalled box) replaces the previous expectation.
@Injectable()
export class GenerateRegistrationTokenUseCase {
    private readonly permissionName = UserPermissionName.CloudAccount.Create;

    constructor(
        private readonly machineAccess: MachineAccess,
        private readonly machineRepository: MachineRepository,
        private readonly registrationTokens: RegistrationTokenService,
    ) {}

    async execute({ creds, params }: GenerateRegistrationTokenInput): Promise<RegistrationTokenGrant> {
        await this.machineAccess.authorize(creds, params.projectId, params.cloudAccountId, params.machineId, this.permissionName);

        const minted = this.registrationTokens.mint();
        const expiresAt = new Date(Date.now() + registrationTokenTtlMs);
        const machine = await this.machineRepository.with(MachineId.fromString(params.machineId), (locked) => {
            locked.expectRegistration(minted.hash, expiresAt);
        });

        if (!machine) {
            throw new Error(`machine ${params.machineId} vanished while issuing its registration token`);
        }

        return { machine, token: minted.token, expiresAt };
    }
}
