import { IsNotEmpty, IsOptional, IsString } from "class-validator";

// Configures where the project's session artifacts are written. No credentials are accepted: access is
// delegated to our service identity via a bucket policy the user sets on their bucket.
export class SetStorageDestinationRequestModel {
    @IsOptional()
    @IsString()
    endpoint?: string;

    @IsOptional()
    @IsString()
    region?: string;

    @IsString()
    @IsNotEmpty()
    bucket: string;

    @IsOptional()
    @IsString()
    prefix?: string;
}
