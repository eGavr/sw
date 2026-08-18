import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsEnum, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

// One compute provider bound to the project: the adapter (`provider`) plus the substrate it provisions
// (`platform` + `execution`) and the provider-specific `config` the adapter needs, so a project can hold
// several providers routed by (platform, execution).
class ComputeModel {
    @IsString()
    provider: string;

    @IsString()
    platform: string;

    @IsEnum(Execution)
    execution: Execution;

    @IsOptional()
    @IsObject()
    config?: Record<string, unknown>;
}

export class CreateProjectRequestModel {
    @IsString()
    displayName: string;

    @IsArray()
    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ComputeModel)
    compute: Array<ComputeModel>;
}
