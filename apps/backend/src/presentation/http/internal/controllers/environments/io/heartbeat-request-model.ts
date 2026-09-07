import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";

// What the agent detected about one delivered application on the device, keyed by the declared word
// it was asked to install (APK manifest: package id + versionName; a platform with nothing detectable
// reports what it can).
class ApplicationDetectionModel {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    detectedName?: string;

    @IsOptional()
    @IsString()
    detectedVersion?: string;
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
