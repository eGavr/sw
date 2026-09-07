import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";

// What the agent detected about one delivered application on the device, keyed by the word
// (`nameAlias`) it was asked to install (APK manifest: `name` = package id, `version` = versionName; a
// platform with nothing detectable reports what it can).
class ApplicationDetectionModel {
    @IsString()
    @IsNotEmpty()
    nameAlias: string;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    version?: string;
}

export class HeartbeatRequestModel {
    // Present on the first heartbeat (registration); omitted afterwards.
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    endpoint?: string;

    @IsBoolean()
    busy: boolean;

    // Registration only: the detected identities of the delivered applications.
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ApplicationDetectionModel)
    applications?: Array<ApplicationDetectionModel>;
}
