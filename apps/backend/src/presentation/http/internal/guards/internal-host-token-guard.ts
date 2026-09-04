import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { HostTokenService } from "../../../../application/interfaces/host-token-service";
import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";

// The host agent's side of the internal API. Each pooled machine presents the per-host bearer token
// minted into its boot metadata at ordering; this guard verifies it (a different audience than the
// environment agent tokens — the two are mutually unusable) and enforces that the token belongs to
// the host the request acts on, so machine A's token cannot drive machine B.
@Injectable()
export class InternalHostTokenGuard implements CanActivate {
    constructor(private readonly hostTokens: HostTokenService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();

        const { hostId } = await this.verifiedIdentity(request);

        const target = targetHostId(request);

        if (target && target !== hostId) {
            throw new UnauthenticatedError();
        }

        return true;
    }

    private async verifiedIdentity(request: Request): Promise<{ hostId: string }> {
        const authorization = request.header("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

        if (!token) {
            throw new UnauthenticatedError();
        }

        try {
            return await this.hostTokens.verify(token);
        } catch {
            throw new UnauthenticatedError();
        }
    }
}

// The host id from the request path: `/internal/poolHosts/<uuid>:<verb>`. Only a uuid-shaped segment
// is a target — routes acting on no specific machine (the agent download) need just a valid token.
function targetHostId(request: Request): string | null {
    const match = request.path.match(
        /\/poolHosts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );

    return match ? match[1] : null;
}
