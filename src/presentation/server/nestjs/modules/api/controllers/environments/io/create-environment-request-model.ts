import { Type } from "class-transformer";
import { IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

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

    @IsOptional()
    @IsString()
    kind?: string;
}

export class CreateEnvironmentRequestModel {
    @IsDefined()
    @ValidateNested()
    @Type(() => PlatformModel)
    platform: PlatformModel;

    @IsDefined()
    @ValidateNested()
    @Type(() => ApplicationModel)
    application: ApplicationModel;
}
