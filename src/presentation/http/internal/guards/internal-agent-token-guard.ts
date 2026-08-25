import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { AgentTokenService } from "../../../../application/interfaces/agent-token-service";
import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";

// The internal callback API is machine-to-machine (the in-environment agent). Each agent presents a
// per-environment bearer token the control plane issued at provision; this guard verifies its signature
// (transport authentication — a presentation concern, unlike our business authorization in AccessControl)
// and enforces that the token belongs to the environment the request acts on, so a token for environment A
// cannot drive environment B. TLS on the channel is the deployment-level complement.
@Injectable()
export class InternalAgentTokenGuard implements CanActivate {
    constructor(private readonly agentTokens: AgentTokenService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();

        const { environmentId } = await this.verifiedIdentity(request);

        // Routes acting on a specific environment must carry that environment's token; routes without one
        // (agent script download) only need a valid token.
        const target = targetEnvironmentId(request);

        if (target && target !== environmentId) {
            throw new UnauthenticatedError();
        }

        return true;
    }

    private async verifiedIdentity(request: Request): Promise<{ environmentId: string }> {
        const authorization = request.header("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

        if (!token) {
            throw new UnauthenticatedError();
        }

        try {
            return await this.agentTokens.verify(token);
        } catch {
            throw new UnauthenticatedError();
        }
    }
}

// The environment id from the request path: `/internal/environments/<id>:<verb>` (heartbeat) or
// `/internal/environments/<id>/sessions/...` (log/video upload). Returns null for non-environment routes.
function targetEnvironmentId(request: Request): string | null {
    const match = request.path.match(/\/environments\/([^/?]+)/);

    return match ? match[1].split(":")[0] : null;
}
