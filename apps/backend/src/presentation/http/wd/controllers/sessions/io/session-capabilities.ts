import { BadRequestException } from "@nestjs/common";

import { defaultExecution, Execution } from "../../../../../../domain/entities/environment/execution";

export type Capabilities = Record<string, unknown>;

export type CapabilitiesEnvelope = {
    alwaysMatch?: unknown;
    firstMatch?: unknown;
};

// The two vocabularies an application is named in: the W3C browser pair for browsers, our vendor pair
// for any application (a browser included). The reply names the application back the same way.
export type ApplicationCapability = "browserName" | "sw:appName";

export type SessionRequestParams = {
    projectId: string;
    execution: string;
    // The platform stereotype parts asked for; each omitted part means any.
    platform: {
        name?: string;
        version?: string;
        deviceModel?: string;
    };
    application: {
        name: string;
        version?: string;
    };
    applicationCapability: ApplicationCapability;
    // Target a specific environment instead of pool allocation (the environment's id or resource id).
    environmentId?: string;
    logging?: boolean;
    video?: boolean;
    netBridge?: boolean;
};

const browserNameCapability: ApplicationCapability = "browserName";
const browserVersionCapability = "browserVersion";
const appNameCapability: ApplicationCapability = "sw:appName";
const appVersionCapability = "sw:appVersion";
const platformNameCapability = "sw:platformName";
const platformVersionCapability = "sw:platformVersion";
const deviceModelCapability = "sw:deviceModel";
// The standard words for the same asks: W3C `platformName`, Appium's version and device caps (which
// device clouds read as the device KIND — so do we). Accepted as aliases, never beside their sw: twin.
const platformCapabilityAliases: Record<string, string> = {
    platformName: platformNameCapability,
    "appium:platformVersion": platformVersionCapability,
    "appium:deviceName": deviceModelCapability,
};
const projectIdCapability = "sw:projectId";
const executionCapability = "sw:execution";
const environmentIdCapability = "sw:environmentId";
const loggingCapability = "sw:logging";
const videoCapability = "sw:video";
const netBridgeCapability = "sw:netbridge";

// Resolves a W3C "New Session" capabilities envelope into the fields our session allocation needs. This
// is the transport→domain boundary for the wd data-plane: the standard `browserName`/`browserVersion`
// or our `sw:appName`/`sw:appVersion` name the requested application, `sw:platformName` /
// `sw:platformVersion` / `sw:deviceModel` (or their W3C/Appium spellings) the platform stereotype,
// and our per-session opt-ins ride as vendor-prefixed `sw:*` capabilities (the way Appium uses
// `appium:*`). Kept pure so it can be unit-tested; a malformed envelope is a transport error (invalid
// argument).
export function resolveSessionRequest(envelope: CapabilitiesEnvelope): SessionRequestParams {
    const capabilities = matchedCapabilities(envelope);
    const { applicationCapability, ...application } = requestedApplication(capabilities);

    return {
        projectId: requireString(capabilities, projectIdCapability),
        execution: optionalExecution(capabilities),
        platform: requestedPlatform(capabilities),
        application,
        applicationCapability,
        environmentId: optionalString(capabilities, environmentIdCapability),
        logging: optionalBoolean(capabilities, loggingCapability),
        video: optionalBoolean(capabilities, videoCapability),
        netBridge: optionalBoolean(capabilities, netBridgeCapability),
    };
}

// The application is named exactly once, in one vocabulary: `browserName` (+ `browserVersion`) or
// `sw:appName` (+ `sw:appVersion`). A version only makes sense beside its own name capability.
function requestedApplication(
    capabilities: Capabilities,
): { name: string; version?: string; applicationCapability: ApplicationCapability } {
    const namedAsBrowser = capabilities[browserNameCapability] !== undefined;
    const namedAsApp = capabilities[appNameCapability] !== undefined;

    if (namedAsBrowser && namedAsApp) {
        throw invalid(`name the application once: either "${browserNameCapability}" or "${appNameCapability}"`);
    }

    if (!namedAsBrowser && !namedAsApp) {
        throw invalid(`capability "${browserNameCapability}" or "${appNameCapability}" is required`);
    }

    const [nameCapability, versionCapability, strayVersionCapability] = namedAsBrowser
        ? [browserNameCapability, browserVersionCapability, appVersionCapability]
        : [appNameCapability, appVersionCapability, browserVersionCapability];

    if (capabilities[strayVersionCapability] !== undefined) {
        throw invalid(`capability "${strayVersionCapability}" belongs with its own name capability, not "${nameCapability}"`);
    }

    return {
        name: requireString(capabilities, nameCapability),
        version: optionalString(capabilities, versionCapability),
        applicationCapability: nameCapability,
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

// Each platform part is read from its sw: capability or its standard alias — one spelling per part.
// W3C platform names are lower-case words (`linux`, `android`); Appium clients habitually send
// `Android`/`iOS`, so the case is normalised here. Which words are platforms is the domain's call.
function requestedPlatform(capabilities: Capabilities): SessionRequestParams["platform"] {
    return {
        name: aliasedString(capabilities, platformNameCapability)?.toLowerCase(),
        version: aliasedString(capabilities, platformVersionCapability),
        deviceModel: aliasedString(capabilities, deviceModelCapability),
    };
}

function aliasedString(capabilities: Capabilities, name: string): string | undefined {
    const alias = Object.keys(platformCapabilityAliases).find((candidate) => platformCapabilityAliases[candidate] === name);

    if (alias !== undefined && capabilities[name] !== undefined && capabilities[alias] !== undefined) {
        throw invalid(`capability "${name}" is also set as "${alias}": set one`);
    }

    return optionalString(capabilities, name) ?? (alias === undefined ? undefined : optionalString(capabilities, alias));
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

// A capability that may be omitted (e.g. browserVersion, whose absence means "latest"); when present
// it must still be a non-empty string.
function optionalString(capabilities: Capabilities, name: string): string | undefined {
    const value = capabilities[name];

    if (value === undefined) {
        return undefined;
    }

    if (typeof value !== "string" || value.length === 0) {
        throw invalid(`capability "${name}" must be a non-empty string`);
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
