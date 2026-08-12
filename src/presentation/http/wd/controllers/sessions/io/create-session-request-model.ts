import { Type } from "class-transformer";
import { IsBoolean, IsDefined, IsOptional, IsString, ValidateNested } from "class-validator";

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

    // Opt-in: capture this session's logs and upload them to the account's storage destination.
    @IsOptional()
    @IsBoolean()
    logging?: boolean;

    // Opt-in: record this session's video and upload it to the account's storage destination.
    @IsOptional()
    @IsBoolean()
    video?: boolean;
}
