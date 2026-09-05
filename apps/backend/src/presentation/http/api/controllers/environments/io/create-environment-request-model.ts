import { Type } from "class-transformer";
import {
    ArrayNotEmpty,
    IsDefined,
    IsEnum,
    IsNotEmpty,
    IsOptional,
    IsString,
    ValidateNested,
} from "class-validator";

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

// The user's own artifact in the project's delegated bucket: the app by object key, plus an optional
// paired webdriver (a custom browser build needs one; a native app does not).
class ApplicationSourceModel {
    @IsString()
    @IsNotEmpty()
    appKey: string;

    @IsOptional()
    @IsString()
    webdriverKey?: string;
}

class ApplicationModel {
    @IsString()
    name: string;

    // Optional for a catalog application (omitted or a prefix resolves to the newest full version);
    // a custom-source application must name its exact version — enforced by the scenario.
    @IsOptional()
    @IsString()
    version?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => ApplicationSourceModel)
    source?: ApplicationSourceModel;
}

export class CreateEnvironmentRequestModel {
    // Optional client-chosen human-readable id (AIP-133), unique within the project; format enforced by
    // the domain ResourceId. When omitted, the environment is addressed by its uid.
    @IsOptional()
    @IsString()
    environmentId?: string;

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
