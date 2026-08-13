import { Type } from "class-transformer";
import { ArrayNotEmpty, IsDefined, IsEnum, IsOptional, IsString, ValidateNested } from "class-validator";

import { Execution } from "../../../../../../domain/entities/environment/execution";

class PlatformModel {
    @IsString()
    name: string;

    @IsString()
    version: string;

    @IsOptional()
    @IsString()
    deviceModel?: string;
}

class ApplicationModel {
    @IsString()
    name: string;

    @IsString()
    version: string;
}

export class CreateEnvironmentRequestModel {
    @IsDefined()
    @ValidateNested()
    @Type(() => PlatformModel)
    platform: PlatformModel;

    // The execution substrate (container | emulator | device); defaults to container when omitted.
    @IsOptional()
    @IsEnum(Execution)
    execution?: Execution;

    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ApplicationModel)
    applications: Array<ApplicationModel>;
}
