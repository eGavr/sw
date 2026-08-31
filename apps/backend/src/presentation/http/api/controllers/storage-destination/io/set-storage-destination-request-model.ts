import { IsNotEmpty, IsOptional, IsString, IsUrl, Matches } from "class-validator";

// Bucket: S3 naming — 3-63 chars, lowercase letters/digits/dots/hyphens, starting and ending
// alphanumeric. Prefix: an object-key path. Region: an S3 region token. These are FORMAT checks only
// (obvious-nonsense rejection); reachability is never probed here.
const bucketPattern = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const prefixPattern = /^[A-Za-z0-9._/-]*$/;
const regionPattern = /^[a-z0-9-]+$/;

// Configures where the project's session artifacts are written. No credentials are accepted: access is
// delegated to our service identity via a bucket policy the user sets on their bucket.
export class SetStorageDestinationRequestModel {
    @IsOptional()
    @IsUrl({ require_protocol: true, require_tld: false }, { message: "endpoint must be a URL like https://host" })
    endpoint?: string;

    @IsOptional()
    @IsString()
    @Matches(regionPattern, { message: "region may only contain lowercase letters, digits and hyphens" })
    region?: string;

    @IsString()
    @IsNotEmpty()
    @Matches(bucketPattern, {
        message: "bucket must be 3-63 chars: lowercase letters, digits, dots and hyphens, starting and ending"
            + " alphanumeric",
    })
    bucket: string;

    @IsOptional()
    @IsString()
    @Matches(prefixPattern, { message: "prefix may only contain letters, digits, and . _ - /" })
    prefix?: string;
}
