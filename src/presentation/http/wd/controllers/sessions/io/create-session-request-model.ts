import { IsDefined, IsObject } from "class-validator";

import type { CapabilitiesEnvelope } from "./session-capabilities";

// W3C WebDriver "New Session" request: { capabilities: { alwaysMatch, firstMatch } }. Only the envelope
// shape is validated here as a transport concern; the arbitrary capability keys inside (standard
// `browserName` / vendor `sw:*`) are resolved into allocation params by resolveSessionRequest.
export class CreateSessionRequestModel {
    @IsDefined()
    @IsObject()
    capabilities: CapabilitiesEnvelope;
}
