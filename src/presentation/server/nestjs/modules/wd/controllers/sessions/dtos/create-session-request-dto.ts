import { Type } from "class-transformer";
import { IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

class ApplicationDto {
    @IsString()
    name: string;

    @IsString()
    version: string;

    @IsOptional()
    @IsString()
    kind?: string;
}

export class CreateSessionRequestDto {
    @IsString()
    environmentId: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => ApplicationDto)
    application: ApplicationDto;
}
