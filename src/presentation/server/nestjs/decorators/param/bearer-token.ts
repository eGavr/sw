import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { UnauthenticatedError } from "../../../../../domain/entities/error/unauthenticated-error";

export const BearerToken = createParamDecorator(
    (_data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const authorization = request.headers.authorization;
    
        if (authorization && authorization.startsWith("Bearer ")) {
            return authorization.split(" ")[1];
        }
    
        throw new UnauthenticatedError();
    },
);
