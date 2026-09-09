import { IsOptional, IsString } from "class-validator";

// Connect a cloud to the project. `type` is validated against the cloud catalogue in the use case;
// `cloudAccountId` is the optional human-readable id the connection is addressed by afterwards
// (AIP-133), and `displayName` its label for people. Nothing else: everything the user must name or
// grant (folder, cluster) belongs to a compute binding, and credentials never travel here.
export class CreateCloudAccountRequestModel {
    @IsString()
    type: string;

    @IsOptional()
    @IsString()
    cloudAccountId?: string;

    @IsOptional()
    @IsString()
    displayName?: string;
}
