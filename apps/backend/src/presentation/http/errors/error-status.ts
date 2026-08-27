import { ConflictError } from "../../../domain/entities/error/conflict-error";
import { DomainError } from "../../../domain/entities/error/domain-error";
import { InvalidArgumentError } from "../../../domain/entities/error/invalid-argument-error";
import { NotFoundError } from "../../../domain/entities/error/not-found/not-found-error";
import { PermissionDeniedError } from "../../../domain/entities/error/permission-denied-error";
import { UnauthenticatedError } from "../../../domain/entities/error/unauthenticated-error";

const rpcStatusByHttpStatus: Record<number, string> = {
    400: "INVALID_ARGUMENT",
    401: "UNAUTHENTICATED",
    403: "PERMISSION_DENIED",
    404: "NOT_FOUND",
    409: "ABORTED",
    429: "RESOURCE_EXHAUSTED",
    500: "INTERNAL",
    501: "UNIMPLEMENTED",
    503: "UNAVAILABLE",
    504: "DEADLINE_EXCEEDED",
};

export function rpcStatusFor(httpStatus: number): string {
    return rpcStatusByHttpStatus[httpStatus] ?? "UNKNOWN";
}

// The single mapping of a domain error to its HTTP status, shared by every transport (the AIP filter
// and the wd interceptor format it differently). Returns null for non-domain errors — the transport
// decides (pass an HttpException through; treat anything else as 500).
export function domainErrorHttpStatus(error: unknown): number | null {
    if (error instanceof InvalidArgumentError) {
        return 400;
    }

    if (error instanceof NotFoundError) {
        return 404;
    }

    if (error instanceof UnauthenticatedError) {
        return 401;
    }

    if (error instanceof PermissionDeniedError) {
        return 403;
    }

    if (error instanceof ConflictError) {
        return 409;
    }

    if (error instanceof DomainError) {
        return 500;
    }

    return null;
}
