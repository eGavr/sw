import { Type } from "class-transformer";
import { ArrayNotEmpty, IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

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

    @ArrayNotEmpty()
    @ValidateNested({ each: true })
    @Type(() => ApplicationModel)
    applications: Array<ApplicationModel>;
}
