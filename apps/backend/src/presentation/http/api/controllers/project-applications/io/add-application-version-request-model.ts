import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AddApplicationVersionRequestModel {
    @IsString()
    @IsNotEmpty()
    version: string;

    // The build's artifact: for a custom build, an object key in the project's delegated bucket
    // (required — enforced by the scenario); the catalog project may omit it (preinstalled).
    @IsOptional()
    @IsString()
    appRef?: string;

    @IsOptional()
    @IsString()
    webdriverRef?: string;
}
