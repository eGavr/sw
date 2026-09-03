import { IsISO8601, IsOptional, IsString, MaxLength } from "class-validator";

// Mint a NetBridge access key for the project. Both fields are optional: `name` is a human label to tell
// keys apart when revoking, `expireTime` (RFC 3339) time-boxes the key. The secret is generated server-side
// and returned once — it is never accepted here.
export class CreateNetBridgeCredentialRequestModel {
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @IsOptional()
    @IsISO8601()
    expireTime?: string;
}
