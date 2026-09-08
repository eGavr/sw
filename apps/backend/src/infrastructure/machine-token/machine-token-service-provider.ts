import { ConfigService } from "@nestjs/config";

import { MachineTokenService } from "../../application/interfaces/machine-token-service";

import { Hs256MachineTokenService } from "./hs256-machine-token-service";

// A machine stays attached for as long as the user keeps it — months — so the token is long-lived
// (90 days); rotation in the sync answer is a follow-up, revocation is detaching the machine.
const defaultTtlSeconds = 90 * 24 * 60 * 60;

// Signed with the same server-side INTERNAL_API_SECRET as the agent tokens (one signing key), but a
// different audience keeps the token kinds mutually unusable.
export const MachineTokenServiceProvider = {
    provide: MachineTokenService,
    useFactory: (configService: ConfigService): MachineTokenService => {
        const key = new TextEncoder().encode(configService.getOrThrow<string>("INTERNAL_API_SECRET"));
        const ttl = Number(configService.get<string>("INTERNAL_MACHINE_TOKEN_TTL_SECONDS") ?? String(defaultTtlSeconds));

        return new Hs256MachineTokenService(key, ttl);
    },
    inject: [ConfigService],
};
