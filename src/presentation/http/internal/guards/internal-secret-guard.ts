import { timingSafeEqual } from "node:crypto";

import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import { UnauthenticatedError } from "../../../../domain/entities/error/unauthenticated-error";

const secretHeader = "x-internal-secret";

// The internal callback API is machine-to-machine (the in-container agent), not user-facing, so it is
// guarded by a shared secret rather than a user token. This is transport authentication — a presentation
// concern — unlike our business authorization, which stays in the application layer (AccessControl).
// mTLS is the deployment-level alternative and remains a follow-up.
@Injectable()
export class InternalSecretGuard implements CanActivate {
    private readonly secret: Buffer;

    constructor(configService: ConfigService) {
        this.secret = Buffer.from(configService.getOrThrow<string>("INTERNAL_API_SECRET"));
    }

    canActivate(context: ExecutionContext): boolean {
        const provided = context.switchToHttp().getRequest<Request>().header(secretHeader);

        if (!provided || !this.matches(provided)) {
            throw new UnauthenticatedError();
        }

        return true;
    }

    private matches(provided: string): boolean {
        const providedBytes = Buffer.from(provided);

        return providedBytes.length === this.secret.length && timingSafeEqual(providedBytes, this.secret);
    }
}
