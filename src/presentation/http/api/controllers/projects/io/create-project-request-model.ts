import { Type } from "class-transformer";
import { ArrayNotEmpty, IsArray, IsEnum, IsString, ValidateNested } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

// One compute provider bound to the project: the adapter (`provider`) plus the substrate it provisions
// (`platform` + `execution`), so an project can hold several providers routed by (platform, execution).
class ComputeModel {
    @IsString()
    provider: string;

    @IsString()
    externalRef: string;

    @IsString()
    platform: string;

    @IsEnum(Execution)
    execution: Execution;
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
