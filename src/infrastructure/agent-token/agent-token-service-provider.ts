import { ConfigService } from "@nestjs/config";

import { AgentTokenService } from "../../application/interfaces/agent-token-service";

import { Hs256AgentTokenService } from "./hs256-agent-token-service";

// Environments outlive a short token, and the agent heartbeats for the whole life, so the default TTL is
// generous (48h). Rotation (re-issuing on heartbeat) is a follow-up; the win here is per-environment
// binding, not a short expiry.
const defaultTtlSeconds = 48 * 60 * 60;

// The signing key is INTERNAL_API_SECRET repurposed: no longer a secret handed to every agent, but the
// key the control plane signs/verifies per-environment tokens with. It never leaves the control plane.
export const AgentTokenServiceProvider = {
    provide: AgentTokenService,
    useFactory: (configService: ConfigService): AgentTokenService => {
        const key = new TextEncoder().encode(configService.getOrThrow<string>("INTERNAL_API_SECRET"));
        const ttl = Number(configService.get<string>("INTERNAL_AGENT_TOKEN_TTL_SECONDS") ?? String(defaultTtlSeconds));

        return new Hs256AgentTokenService(key, ttl);
    },
    inject: [ConfigService],
};
