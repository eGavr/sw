import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateProjectApplicationRequestModel {
    @IsString()
    @IsNotEmpty()
    name: string;

    // Wire vocabulary (`chrome`) — accepted only in the reserved catalog project; a custom application
    // is addressed by its canonical name (enforced by the scenario).
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    aliases?: Array<string>;
}
