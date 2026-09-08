import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";

import { LeaseTokenService } from "../../../../application/interfaces/lease-token-service";
import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";

// The host agent's side of the internal API. Each pooled machine presents the per-host bearer token
// minted into its boot metadata at ordering; this guard verifies it (a different audience than the
// environment agent tokens — the two are mutually unusable) and enforces that the token belongs to
// the host the request acts on, so machine A's token cannot drive machine B.
@Injectable()
export class InternalLeaseTokenGuard implements CanActivate {
    constructor(private readonly leaseTokens: LeaseTokenService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();

        const { leaseId } = await this.verifiedIdentity(request);

        const target = targetHostId(request);

        if (target && target !== leaseId) {
            throw new UnauthenticatedError();
        }

        return true;
    }

    private async verifiedIdentity(request: Request): Promise<{ leaseId: string }> {
        const authorization = request.header("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

        if (!token) {
            throw new UnauthenticatedError();
        }

        try {
            return await this.leaseTokens.verify(token);
        } catch {
            throw new UnauthenticatedError();
        }
    }
}

// The host id from the request path: `/internal/machineLeases/<uuid>:<verb>`. Only a uuid-shaped segment
// is a target — routes acting on no specific machine (the agent download) need just a valid token.
function targetHostId(request: Request): string | null {
    const match = request.path.match(
        /\/machineLeases\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );

    return match ? match[1] : null;
}
