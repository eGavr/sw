import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class AddApplicationVersionRequestModel {
    // The owner's free-form label — the build's id ("152", "7.1-rc2").
    @IsString()
    @IsNotEmpty()
    alias: string;

    // The exact full version — catalog vocabulary only (the trusted source declares, the measurement
    // cross-checks); a custom build's true version is measured at delivery.
    @IsOptional()
    @IsString()
    version?: string;

    // The build's artifact: for a custom build, an object key in the project's delegated bucket
    // (required — enforced by the scenario); the catalog project may omit it (preinstalled).
    @IsOptional()
    @IsString()
    appRef?: string;

    @IsOptional()
    @IsString()
    webdriverRef?: string;
}
