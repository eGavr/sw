import { Type } from "class-transformer";
import { IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

class ApplicationModel {
    @IsString()
    name: string;

    @IsString()
    version: string;

    @IsOptional()
    @IsString()
    kind?: string;
}

export class CreateSessionRequestModel {
    @IsString()
    accountId: string;

    @IsDefined()
    @ValidateNested()
    @Type(() => ApplicationModel)
    application: ApplicationModel;
}
