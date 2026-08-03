import { Type } from "class-transformer";
import { IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

class PlatformDto {
    @IsString()
    name: string;

    @IsString()
    version: string;

    @IsOptional()
    @IsString()
    deviceModel?: string;
}

class ApplicationDto {
    @IsString()
    name: string;

    @IsString()
    version: string;

    @IsOptional()
    @IsString()
    kind?: string;
}

export class CreateEnvironmentRequestDto {
    @IsDefined()
    @ValidateNested()
    @Type(() => PlatformDto)
    platform: PlatformDto;

    @IsDefined()
    @ValidateNested()
    @Type(() => ApplicationDto)
    application: ApplicationDto;
}
