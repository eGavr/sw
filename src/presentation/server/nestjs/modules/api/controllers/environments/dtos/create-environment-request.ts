import { IsString } from "class-validator";

export class CreateEnvironmentRequest {
    @IsString()
    platformName: string;

    @IsString()
    platformVersion: string;
}
