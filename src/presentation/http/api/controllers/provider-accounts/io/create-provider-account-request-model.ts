import { IsEnum, IsObject, IsOptional, IsString } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

export class CreateProviderAccountRequestModel {
    // The registered compute backend (validated against the provider catalogue in the use case).
    @IsString()
    provider: string;

    @IsString()
    platform: string;

    // The execution substrate (container | emulator | device); defaults to container when omitted.
    @IsOptional()
    @IsEnum(Execution)
    execution?: Execution;

    // Non-secret, provider-specific provisioning settings; the adapter validates its shape at provision time.
    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}
