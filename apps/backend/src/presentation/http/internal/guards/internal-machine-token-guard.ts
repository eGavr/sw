import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";

import { MachineTokenService } from "../../../../application/interfaces/machine-token-service";
import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";

// The machine agent's side of the internal API. Each machine presents the per-machine bearer token it
// obtained by spending its registration token; this guard verifies it (a different audience than the
// environment agent tokens — the two are mutually unusable) and enforces that the token belongs to the
// machine the request acts on, so machine A's token cannot drive machine B.
@Injectable()
export class InternalMachineTokenGuard implements CanActivate {
    constructor(private readonly machineTokens: MachineTokenService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<Request>();
        const { machineId } = await this.verifiedIdentity(request);
        const target = targetMachineId(request);

        if (target && target !== machineId) {
            throw new UnauthenticatedError();
        }

        return true;
    }

    private async verifiedIdentity(request: Request): Promise<{ machineId: string }> {
        const authorization = request.header("authorization") ?? "";
        const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

        if (!token) {
            throw new UnauthenticatedError();
        }

        try {
            return await this.machineTokens.verify(token);
        } catch {
            throw new UnauthenticatedError();
        }
    }
}

// The machine id from the request path: `/internal/machines/<uuid>:<verb>`. Only a uuid-shaped
// segment is a target — routes acting on no specific machine (the agent download) need just a valid token.
function targetMachineId(request: Request): string | null {
    const match = request.path.match(
        /\/machines\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );

    return match ? match[1] : null;
}
