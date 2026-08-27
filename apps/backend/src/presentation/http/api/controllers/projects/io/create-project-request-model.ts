import { IsOptional, IsString } from "class-validator";

export class CreateProjectRequestModel {
    // Optional client-chosen human-readable id (AIP-133); its format is enforced by the domain ResourceId.
    // When omitted, the project is addressed by its uid.
    @IsOptional()
    @IsString()
    projectId?: string;

    @IsString()
    displayName: string;
}
