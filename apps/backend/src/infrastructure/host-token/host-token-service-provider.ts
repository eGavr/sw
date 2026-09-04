import { ConfigService } from "@nestjs/config";

import { HostTokenService } from "../../application/interfaces/host-token-service";

import { Hs256HostTokenService } from "./hs256-host-token-service";

// A pooled machine lives as long as its pool keeps it busy — days, not the hours of one environment —
// so the host token's default TTL is a week. Rotation (re-issuing in the heartbeat response) is a
// follow-up; the win here is per-host binding, not a short expiry.
const defaultTtlSeconds = 7 * 24 * 60 * 60;

// Signed with the same server-side INTERNAL_API_SECRET as the agent tokens (one signing key), but a
// different audience keeps the two token kinds mutually unusable.
export const HostTokenServiceProvider = {
    provide: HostTokenService,
    useFactory: (configService: ConfigService): HostTokenService => {
        const key = new TextEncoder().encode(configService.getOrThrow<string>("INTERNAL_API_SECRET"));
        const ttl = Number(configService.get<string>("INTERNAL_HOST_TOKEN_TTL_SECONDS") ?? String(defaultTtlSeconds));

        return new Hs256HostTokenService(key, ttl);
    },
    inject: [ConfigService],
};
