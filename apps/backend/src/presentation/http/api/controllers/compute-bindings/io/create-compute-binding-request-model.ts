import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

// Bind a substrate of the cloud connection to a compute kind. Which kinds a substrate offers — and the
// config keys each requires — is validated against the catalogue in the use case; this checks transport
// format only.
export class CreateComputeBindingRequestModel {
    @IsString()
    @IsNotEmpty()
    platform: string;

    @IsEnum(Execution)
    execution: Execution;

    @IsString()
    @IsNotEmpty()
    kind: string;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}
