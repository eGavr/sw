import { BadRequestException } from "@nestjs/common";

import { defaultExecution, Execution } from "../../../../../../domain/entities/environment/execution";

export type Capabilities = Record<string, unknown>;

export type CapabilitiesEnvelope = {
    alwaysMatch?: unknown;
    firstMatch?: unknown;
};

export type SessionRequestParams = {
    accountId: string;
    execution: string;
    application: {
        name: string;
        version: string;
    };
    logging?: boolean;
    video?: boolean;
};

const accountIdCapability = "sw:accountId";
const executionCapability = "sw:execution";
const loggingCapability = "sw:logging";
const videoCapability = "sw:video";

// Resolves a W3C "New Session" capabilities envelope into the fields our session allocation needs. This
// is the transport→domain boundary for the wd data-plane: the standard `browserName`/`browserVersion`
// name the requested application, and our per-session opt-ins ride as vendor-prefixed `sw:*` capabilities
// (the way Appium uses `appium:*`). Kept pure so it can be unit-tested; a malformed envelope is a
// transport error (invalid argument).
export function resolveSessionRequest(envelope: CapabilitiesEnvelope): SessionRequestParams {
    const capabilities = matchedCapabilities(envelope);

    return {
        accountId: requireString(capabilities, accountIdCapability),
        execution: optionalExecution(capabilities),
        application: {
            name: requireString(capabilities, "browserName"),
            version: requireString(capabilities, "browserVersion"),
        },
        logging: optionalBoolean(capabilities, loggingCapability),
        video: optionalBoolean(capabilities, videoCapability),
    };
}

// Which execution substrate the session must land on; omitted means the default (container), so a plain
// browser request needs no sw:execution. Validated against the domain enum here at the transport edge.
function optionalExecution(capabilities: Capabilities): string {
    const value = capabilities[executionCapability];

    if (value === undefined) {
        return defaultExecution;
    }

    if (typeof value !== "string" || !Object.values(Execution).some((candidate) => candidate === value)) {
        throw invalid(`capability "${executionCapability}" must be one of: ${Object.values(Execution).join(", ")}`);
    }

    return value;
}

// W3C capability processing, reduced to a single effective set: `alwaysMatch` applies to every session,
// and each `firstMatch` entry is an alternative merged on top of it with disjoint keys. We allocate one
// environment, so we take the first alternative; the two sets must not redefine the same capability.
function matchedCapabilities(envelope: CapabilitiesEnvelope): Capabilities {
    const always = requireObject(envelope.alwaysMatch ?? {}, "alwaysMatch");
    const firstMatch = envelope.firstMatch ?? [];

    if (!Array.isArray(firstMatch)) {
        throw invalid("capabilities.firstMatch must be an array");
    }

    if (firstMatch.length === 0) {
        return always;
    }

    const first = requireObject(firstMatch[0], "firstMatch[0]");

    for (const key of Object.keys(first)) {
        if (key in always) {
            throw invalid(`capability "${key}" is set in both alwaysMatch and firstMatch`);
        }
    }

    return { ...always, ...first };
}

function requireObject(value: unknown, field: string): Capabilities {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw invalid(`capabilities.${field} must be an object`);
    }

    return value as Capabilities;
}

function requireString(capabilities: Capabilities, name: string): string {
    const value = capabilities[name];

    if (typeof value !== "string" || value.length === 0) {
        throw invalid(`capability "${name}" is required and must be a non-empty string`);
    }

    return value;
}

function optionalBoolean(capabilities: Capabilities, name: string): boolean | undefined {
    const value = capabilities[name];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "boolean") {
        throw invalid(`capability "${name}" must be a boolean`);
    }

    return value;
}

function invalid(message: string): BadRequestException {
    return new BadRequestException(message);
}
