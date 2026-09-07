import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";

// What the agent measured about one delivered application on the device, keyed by the declared word
// it was asked to install (APK manifest: package id + versionName; a platform with nothing measurable
// reports what it can).
class ApplicationMeasurementModel {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsOptional()
    @IsString()
    measuredName?: string;

    @IsOptional()
    @IsString()
    measuredVersion?: string;
}

export class HeartbeatRequestModel {
    // Present on the first heartbeat (registration); omitted afterwards.
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    endpoint?: string;

    @IsBoolean()
    busy: boolean;

    // Registration only: the measured identities of the delivered applications.
    @IsOptional()
    @ValidateNested({ each: true })
    @Type(() => ApplicationMeasurementModel)
    applications?: Array<ApplicationMeasurementModel>;
}
